const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const browserStorage=new Map([['eduethos.course-demo.v1',JSON.stringify({version:1,sessions:[{id:'legacy-A',title:'old private data',chapterId:'memory',messages:[]}],docs:[],displayName:'A',role:'student'})]]);
let storageReads=0,activeUser={id:'user-a',username:'alice',displayName:'Alice',role:'student'};
const states={
  'user-a':{revision:0,state:{sessions:[{id:'only-A',title:'A private question',chapterId:'memory',updatedAt:'2026-11-03T00:00:00Z',messages:[]}],docs:[],activeSessionId:'only-A'}},
  'user-b':{revision:0,state:{sessions:[],docs:[],activeSessionId:''}},
  'teacher-1':{revision:0,state:{sessions:[{id:'teacher-private',title:'teacher question',chapterId:'memory',messages:[]}],docs:[],activeSessionId:''}},
  'admin-1':{revision:0,state:{sessions:[],docs:[],activeSessionId:''}},
  'admin-2':{revision:0,state:{sessions:[],docs:[],activeSessionId:''}}
};
const users={
  alice:{id:'user-a',username:'alice',displayName:'Alice',role:'student'},
  bob:{id:'user-b',username:'bob',displayName:'Bob',role:'student'},
  teach:{id:'teacher-1',username:'teach',displayName:'Teacher',role:'teacher'},
  root:{id:'admin-1',username:'root',displayName:'Admin',role:'admin'},
  root2:{id:'admin-2',username:'root2',displayName:'Second Admin',role:'admin'}
};
let chatResponse=null,chatStarted=null;
const calls=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const answer={answer:{paragraphs:['已回答'],bullets:[],sourceIds:[],followups:[],supported:true,topic:'cache',mode:'model'},sources:[]};
const fakeFetch=async(url,options={})=>{
  const headers=options.headers||{};const body=options.body?JSON.parse(options.body):{};
  const requestUser=activeUser;calls.push({url,method:options.method||'GET',headers,body,userId:requestUser?.id||''});
  if(url==='/api/health')return json({accountMode:'isolated',configured:true,knowledgeCount:1,model:'mock',demoLoginEnabled:false,requiresSignIn:!activeUser,user:activeUser});
  if(url==='/api/auth/login'){activeUser=users[body.username]||null;return activeUser?json({user:activeUser}):json({error:'invalid credentials'},401);}
  if(url==='/api/auth/logout'){activeUser=null;return json({ok:true});}
  if(url==='/api/me/state'){
    if(!requestUser)return json({error:'expired'},401);
    if(headers['X-Expected-User-Id']!==requestUser.id)return json({code:'identity_mismatch'},409);
    if(options.method==='PUT'){
      if(body.userId!==requestUser.id)return json({code:'identity_mismatch'},409);
      const current=states[requestUser.id];if(body.revision!==current.revision)return json({code:'revision_conflict'},409);
      current.revision++;current.state=body.state;return json({userId:requestUser.id,revision:current.revision});
    }
    return json({userId:requestUser.id,...states[requestUser.id]});
  }
  if(url==='/api/teacher/questions')return headers['X-Expected-User-Id']==='teacher-1'
    ?json({userId:'teacher-1',classes:[{id:'class-1',name:'计算机一班'}],sessions:[{id:'authorized-class',chapterId:'memory',messages:[{id:'student-question',question:'为什么需要 Cache？',createdAt:'2026-11-02T00:00:00Z',authorRole:'student',isDemo:false,answer:{supported:true,topic:'cache'},feedback:''}]}]})
    :json({error:'forbidden'},403);
  if(url==='/api/admin/overview')return json({userId:requestUser?.id,users:[users.alice,users.teach],classes:[{id:'class-1',name:'计算机一班'}],memberships:[{classId:'class-1',userId:'user-a'}]});
  if(url==='/api/admin/users'||url==='/api/admin/classes'||url==='/api/admin/memberships')return json({userId:'admin-1',ok:true});
  if(url==='/api/chat'){
    if(chatStarted)chatStarted(requestUser?.id,headers['X-Expected-User-Id']);
    if(chatResponse)return chatResponse.promise;
    return json(answer);
  }
  throw Error(`Unexpected request ${url}`);
};
const context=vm.createContext({
  window:{EDUETHOS_ACCOUNT_MODE:'isolated',COURSE_DATA:{chapters:[{id:'memory'}],docs:[]},crypto:require('node:crypto').webcrypto,addEventListener(){}},
  fetch:fakeFetch,localStorage:{getItem(key){storageReads++;return browserStorage.get(key)||null;},setItem(key,value){browserStorage.set(key,value);}},
  document:{hidden:false,addEventListener(){},getElementById(){return null;},querySelector(){return null;}},AbortController,setTimeout,clearTimeout,Date,console,
});
for(const file of ['analytics.js','report.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','dist',file),'utf8'),context);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  const app=context.window.eduApp();app.$nextTick=fn=>fn();app.scrollToLast=()=>{};app.notify=()=>{};app.init();
  assert.equal(storageReads,0,'isolated boot must not read or import unowned legacy browser records');
  await app.refreshServiceStatus();
  assert.equal(app.accountId,'user-a');assert.deepEqual(app.sessions.map(s=>s.id),['only-A'],app.loginError||'');
  app.newChat();
  app.appendAnswer('A-only question',answer);await tick();await tick();
  assert(calls.some(c=>c.url==='/api/me/state'&&c.method==='PUT'&&c.userId==='user-a'&&c.headers['X-Expected-User-Id']==='user-a'));

  activeUser=users.bob;await app.refreshServiceStatus();
  assert.equal(app.accountId,'user-b');assert.equal(app.sessions.length,0,'switching identities must clear the previous account before loading the new one');
  assert.notEqual(app.messages.some(m=>m.question==='A-only question'),true);
  await app.loginDemo();

  // A pending A response arriving after a same-tab account change is discarded.
  activeUser=users.alice;await app.refreshServiceStatus();
  const pending=deferred();chatResponse=pending;let chatOwner,chatExpected;chatStarted=(owner,expected)=>{chatOwner=owner;chatExpected=expected;};
  const oldChat=app.send('A pending question');await tick();
  assert.equal(chatOwner,'user-a');assert.equal(chatExpected,'user-a');
  activeUser=users.bob;await app.refreshServiceStatus();
  pending.resolve(json(answer));await oldChat;
  assert.equal(app.accountId,'user-b');assert.equal(app.messages.some(m=>m.question==='A pending question'),false);
  assert.equal(calls.some(c=>c.url==='/api/chat'&&c.headers['X-Expected-User-Id']!=='user-a'),false);
  chatResponse=null;chatStarted=null;

  // Authentication expiry clears both the user label and all private memory.
  activeUser=users.alice;await app.refreshServiceStatus();
  chatResponse={promise:Promise.resolve(json({code:'identity_mismatch'},401))};
  await app.send('expired session');
  assert.equal(app.demoUser,null);assert.equal(app.accountId,'');assert.equal(app.sessions.length,0);assert.equal(app.entryOpen,true);
  chatResponse=null;

  // A teacher dashboard and its Word report use only server-authorized class data.
  activeUser=users.teach;await app.refreshServiceStatus();
  assert.equal(app.role,'teacher');assert.equal(app.teacherClasses[0].name,'计算机一班');
  assert.equal(app.analytics.total,1);assert.equal(app.analytics.questions[0].question,'为什么需要 Cache？');
  assert.equal(app.analyticsSource,'actual');
  assert(calls.some(c=>c.url==='/api/teacher/questions'&&c.headers['X-Expected-User-Id']==='teacher-1'));

  // Administrators create accounts/classes and assign memberships with server auth.
  activeUser=users.root;await app.refreshServiceStatus();
  app.newAccount={username:'new_student',displayName:'新同学',password:'Strong-Test-Password-1',role:'student'};
  assert.equal(await app.createAccount(),undefined);assert.equal(app.newAccount.password,'');
  app.newClassName='计算机二班';await app.createClass();assert.equal(app.newClassName,'');
  app.assignClassId='class-1';app.assignUserId='user-a';await app.assignClass();
  assert(calls.some(c=>c.url==='/api/admin/users'&&c.body.username==='new_student'&&c.userId==='admin-1'));
  assert(calls.some(c=>c.url==='/api/admin/classes'&&c.body.name==='计算机二班'));
  assert(calls.some(c=>c.url==='/api/admin/memberships'&&c.body.userId==='user-a'&&c.headers['X-Expected-User-Id']==='admin-1'));

  // Unsubmitted administrative form data, especially passwords, must not cross accounts.
  app.newAccount={username:'unfinished-user',displayName:'未提交',password:'unsaved-initial-password',role:'teacher'};
  app.newClassName='未提交班级';app.assignClassId='class-1';app.assignUserId='user-a';
  await app.logoutDemo();activeUser=users.root2;await app.refreshServiceStatus();
  assert.equal(app.accountId,'admin-2');
  assert.equal(JSON.stringify(app.newAccount),JSON.stringify({username:'',displayName:'',password:'',role:'student'}));
  assert.equal(app.newClassName,'');assert.equal(app.assignClassId,'');assert.equal(app.assignUserId,'');
  assert.equal(storageReads,0,'account actions must continue avoiding localStorage');
  assert.equal(browserStorage.has('eduethos.course-demo.v1'),true,'unowned historical data is left untouched rather than claimed');
  console.log('Account UI isolation checks passed: no legacy storage import, per-user state, identity switch, stale response discard, session expiry, authorized teacher statistics and admin controls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
