const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

let account = null, loginMode = 'reject', logoutMode = 'ok', apiMode = 'ok';
const storage = new Map();
const context = vm.createContext({
  window: { COURSE_DATA: { chapters: [{id:'memory'}], docs: [] }, crypto: require('node:crypto').webcrypto },
  fetch: async (url, options = {}) => {
    if (url === '/api/health') return {ok:true,json:async()=>({configured:true,knowledgeCount:1,model:'demo',demoLoginEnabled:true,requiresSignIn:!account,user:account})};
    if (url === '/api/demo/login') {
      if (loginMode === 'timeout') return new Promise((_, reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
      if (loginMode !== 'ok' || JSON.parse(options.body).password !== 'correct') return {ok:false,json:async()=>({error:'账号或密码错误',code:'invalid_credentials'})};
      account={username:'teacher-demo',role:'teacher',displayName:'体验教师'};
      return {ok:true,json:async()=>({user:account})};
    }
    if (url === '/api/demo/logout') {
      if(logoutMode==='reject')return {ok:false,json:async()=>({error:'logout failed'})};
      account=null;return {ok:true,json:async()=>({ok:true})};
    }
    if (url === '/api/chat' && apiMode==='expired') return {status:401,ok:false,json:async()=>({code:'sign_in_required',error:'请重新登录'})};
    throw new Error(`Unexpected request ${url}`);
  },
  localStorage: {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  document: {getElementById(){return null;},querySelector(){return null;}},
  AbortController, setTimeout:(fn,ms,...args)=>setTimeout(fn,ms===12000?20:ms,...args), clearTimeout, Date, console,
});
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
const app=context.window.eduApp();app.$nextTick=fn=>fn();

(async()=>{
  app.demoLoginEnabled=true;app.entryOpen=true;app.loginUsername='teacher-demo';app.loginPassword='wrong';
  await app.loginDemo();assert.match(app.loginError,/错误/);assert.equal(app.demoUser,null);assert.equal(app.entryOpen,true);
  loginMode='ok';app.loginPassword='correct';await app.loginDemo();assert.equal(app.demoUser.role,'teacher');assert.equal(app.role,'teacher');assert.equal(app.view,'analytics');
  assert.equal(app.loginPassword,'');assert.equal(JSON.stringify([...storage.values()]).includes('correct'),false,'password must not enter local browser storage');
  app.switchRole('student');assert.equal(app.role,'teacher','account role remains fixed');
  app.view='chat';await app.refreshServiceStatus();assert.equal(app.view,'chat','health refresh must not interrupt an active teacher chat');
  app.showEntry();assert.equal(app.guestMode,false);assert.equal(app.entryOpen,true);
  app.guestMode=true;app.showEntry();assert.equal(app.guestMode,false,'account options reopen on the login form');
  logoutMode='reject';await app.logoutDemo();assert.ok(app.demoUser);assert.equal(app.entryOpen,true,'failed logout must preserve the current account');assert.equal(app.loginBusy,false);
  app.entryOpen=false;logoutMode='ok';await app.logoutDemo();assert.equal(app.demoUser,null);assert.equal(app.entryOpen,true);assert.equal(app.guestMode,false);assert.equal(app.loginUsername,'');
  loginMode='timeout';app.loginUsername='teacher-demo';app.loginPassword='correct';await app.loginDemo();assert.equal(app.loginBusy,false,'timed-out login must release its busy state');assert.match(app.loginError,/超时/);loginMode='ok';
  account={username:'teacher-demo',role:'teacher',displayName:'体验教师'};await app.refreshServiceStatus();assert.equal(app.view,'analytics','health restores a new server identity');
  app.view='chat';apiMode='expired';await app.send('检查过期会话');assert.equal(app.demoUser,null);assert.equal(app.guestMode,false);assert.equal(app.entryOpen,true);assert.match(app.loginError,/请登录/);
  app.closeToast();console.log('demo UI checks passed: rejection, login, role lock, health restore, teacher chat, guest reset, logout failure/success, timeout, expired session and password storage');
})().catch(error=>{console.error(error);process.exitCode=1;});
