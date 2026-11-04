'use strict';
// Demo history is browser-local. Self-hosted account history is server-owned.
window.eduApp = function () {
  const KEY = 'eduethos.course-demo.v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const requestWithTimeout = (url, options, timeoutMs=12000) => {
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('请求超时，请稍后重试。'));},timeoutMs);});
    return Promise.race([fetch(url,{...options,signal:controller.signal}),timeout]).finally(()=>clearTimeout(timer));
  };
  let toastTimer, returnFocus;
  let identityEpoch=0;
  let isolatedWriteChain=Promise.resolve();
  return {
    role: 'student', chapterId: 'memory', view: 'chat', chapters: copy(window.COURSE_DATA.chapters),
    docs: copy(window.COURSE_DATA.docs), messages: [], sessions: [], activeSessionId: '', activeMessageId: '',
    draft: '', busy: false, error: '', toast: '', storageWarning: '', sidebarOpen: false,
    sourceOpen: false, activeSource: null, entryOpen: true, displayName: '同学', entryName: '', entryRole: 'student',
    demoLoginEnabled: false, guestMode: false, demoUser: null, loginUsername: '', loginPassword: '', loginBusy: false, loginError: '',
    initialized: false, identityReady: false, accountMode: 'demo', accountId: '', stateRevision: 0,
    identityEpoch: 0, identityLoadPromise: null, reportExporting: false, serviceStatus: '正在检查问答服务…',
    serviceModel: '', knowledgeCount: 0, signInRequired: false,
    analyticsSource: 'actual', analyticsRange: 'all', analyticsFilter: 'all', sampleAnalyticsSessions: [],
    teacherSessions: [], teacherClasses: [], teacherDataLoaded: false,
    adminUsers: [], adminClasses: [], adminMemberships: [], adminLoading: false,
    newAccount: {username:'',displayName:'',password:'',role:'student'}, newClassName:'', assignClassId:'', assignUserId:'',
    get suggestionQuestions() { return ['为什么需要 Cache？','CPU 如何执行一条指令？','存储器如何提高数据可靠性？']; },
    get analytics() {
      const sessions=this.accountMode==='isolated'&&this.role==='teacher' ? this.teacherSessions : this.analyticsSource==='sample'?this.sampleAnalyticsSessions:this.sessions;
      return window.CourseAnalytics.build(sessions,{range:this.analyticsRange,now:new Date()});
    },
    get filteredAnalyticsQuestions() {
      return this.analytics.questions.filter(q=>this.analyticsFilter==='all'||q.categoryId===this.analyticsFilter).slice(0,8);
    },
    get currentChapter() { return this.chapters.find(c => c.id === this.chapterId) || this.chapters[2]; },
    get currentMessage() { return this.messages.find(m => m.id === this.activeMessageId) || this.messages.at(-1) || null; },
    get relevantSources() { return this.currentMessage?.sources || []; },
    sourceLabel(source) {
      if (!source) return '查看资料';
      const location = source.section || '';
      return source.title + (location ? ' · ' + (location.length > 28 ? location.slice(0,28)+'…' : location) : '');
    },
    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.sampleAnalyticsSessions=window.CourseAnalytics.sampleSessions(new Date());
      // The self-hosted entry point injects this flag before app.js runs. Never
      // read browser-local history on that path, even before health has loaded.
      this.accountMode=window.EDUETHOS_ACCOUNT_MODE==='isolated'?'isolated':'demo';
      if(this.accountMode==='isolated'){
        this.identityReady=false;this.resetPrivateState();this.demoUser=null;this.accountId='';this.entryOpen=true;
      }else this.restoreLocalState();
      if(this.accountMode==='isolated'){
        window.addEventListener?.('focus',()=>this.refreshServiceStatus());
        document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)this.refreshServiceStatus();});
      }
      this.refreshServiceStatus();
      document.addEventListener('keydown', e => {
        if (e.key !== 'Tab' || !(this.entryOpen || this.sourceOpen)) return;
        const dialog = document.querySelector(this.sourceOpen ? '.source-dialog' : '.entry-dialog');
        const nodes = [...(dialog?.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]') || [])].filter(n=>!n.disabled && n.getClientRects().length);
        if (!nodes.length) return;
        if (e.shiftKey && (document.activeElement===nodes[0] || !dialog.contains(document.activeElement))) {e.preventDefault();nodes.at(-1).focus();}
        else if (!e.shiftKey && (document.activeElement===nodes.at(-1) || !dialog.contains(document.activeElement))) {e.preventDefault();nodes[0].focus();}
      });
    },
    restoreLocalState() {
      try {
        const raw=localStorage.getItem(KEY);
        if(raw){
          const saved=JSON.parse(raw);
          if(saved.version!==1||!Array.isArray(saved.sessions)||!Array.isArray(saved.docs))throw new Error('invalid state');
          const isDoc=d=>d&&typeof d.id==='string'&&typeof d.title==='string'&&typeof d.text==='string'&&this.chapters.some(c=>c.id===d.chapterId);
          this.docs=saved.docs.filter(isDoc).slice(0,40).map(d=>({...d,enabled:d.enabled!==false}));
          for(const d of window.COURSE_DATA.docs){const index=this.docs.findIndex(x=>x.id===d.id);if(index<0)this.docs.push(copy(d));else this.docs[index]=copy(d);}
          this.sessions=saved.sessions.filter(s=>s&&typeof s.id==='string'&&typeof s.title==='string'&&this.chapters.some(c=>c.id===s.chapterId)&&Array.isArray(s.messages)).slice(0,20);
          for(const s of this.sessions)s.messages=s.messages.filter(m=>m&&typeof m.id==='string'&&typeof m.question==='string'&&m.answer&&Array.isArray(m.answer.paragraphs)&&Array.isArray(m.answer.bullets)&&Array.isArray(m.answer.sourceIds)&&Array.isArray(m.answer.followups)&&Array.isArray(m.sources)).slice(-40);
          this.displayName=String(saved.displayName||'同学').slice(0,20);this.role=saved.role==='teacher'?'teacher':'student';this.entryOpen=saved.entered!==true;
          const session=this.sessions.find(s=>s.id===saved.activeSessionId)||this.sessions[0];if(session)this.restoreSession(session);
        }
      } catch(_){this.storageWarning='未能读取本地记录，当前可继续体验；原记录未被主动删除。';}
      this.entryName=this.displayName==='同学'?'':this.displayName;this.entryRole=this.role;
      this.view=this.role==='teacher'?'analytics':'chat';
      if(!this.activeSessionId){this.activeSessionId=uid();this.chapterId='memory';}
      this.identityReady=true;
    },
    resetPrivateState() {
      this.sessions=[];this.messages=[];this.activeMessageId='';this.activeSessionId=uid();this.chapterId='memory';
      this.docs=copy(window.COURSE_DATA.docs);this.draft='';this.error='';this.storageWarning='';
      this.stateConflict=false;
      this.teacherSessions=[];this.teacherClasses=[];this.teacherDataLoaded=false;
      this.analyticsSource='actual';this.analyticsFilter='all';this.analyticsRange='all';
      this.adminUsers=[];this.adminClasses=[];this.adminMemberships=[];
      this.newAccount={username:'',displayName:'',password:'',role:'student'};
      this.newClassName='';this.assignClassId='';this.assignUserId='';this.adminLoading=false;
      this.sourceOpen=false;this.activeSource=null;this.sidebarOpen=false;
    },
    normalizeServerUser(user) {
      return user&&typeof user.id==='string'&&['admin','student','teacher'].includes(user.role)&&typeof user.username==='string'
        ? {id:user.id,username:user.username,role:user.role,displayName:String(user.displayName||user.username).slice(0,40)} : null;
    },
    clearIsolatedIdentity(message='登录已过期，请重新登录。') {
      identityEpoch++;this.identityEpoch=identityEpoch;this.demoUser=null;this.accountId='';this.stateRevision=0;
      this.identityLoadPromise=null;
      this.resetPrivateState();this.role='student';this.displayName='同学';this.view='chat';this.entryOpen=true;
      this.loginPassword='';this.loginError=message;this.signInRequired=true;this.identityReady=true;
    },
    async isolatedRequest(url, options={}, expectedId=this.accountId) {
      const headers={Accept:'application/json',...(options.headers||{})};
      if(expectedId)headers['X-Expected-User-Id']=expectedId;
      if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
      const epoch=identityEpoch;
      const response=await requestWithTimeout(url,{...options,headers});
      let payload={};try{payload=await response.json();}catch(_){ }
      if(epoch!==identityEpoch)throw Object.assign(new Error('账号已切换，请重新操作。'),{code:'stale_identity'});
      if(response.status===401){this.clearIsolatedIdentity('登录已过期，请重新登录。');throw Object.assign(new Error('登录已过期，请重新登录。'),{code:'identity_expired'});}
      if(response.status===409&&['identity_mismatch','identity_changed'].includes(payload.code)){
        this.clearIsolatedIdentity('此浏览器中的账号已在其他标签页切换，请重新登录。');
        throw Object.assign(new Error('账号已在其他标签页切换，请重新登录。'),{code:'identity_mismatch'});
      }
      return {response,payload,epoch};
    },
    async activateIsolatedUser(user) {
      user=this.normalizeServerUser(user);
      if(!user){this.clearIsolatedIdentity('请使用管理员创建的账号登录。');return false;}
      const changed=this.accountId!==user.id;
      if(changed){identityEpoch++;this.identityEpoch=identityEpoch;this.resetPrivateState();this.accountId=user.id;this.stateRevision=0;}
      this.demoUser=user;this.role=user.role;this.displayName=user.displayName;
      this.entryOpen=false;this.loginPassword='';this.loginError='';this.guestMode=false;this.signInRequired=false;
      this.entryName=user.displayName;this.view=user.role==='admin'?'admin':user.role==='teacher'?'analytics':'chat';
      this.identityReady=false;
      const expected=user.id, epoch=identityEpoch;
      if(changed){
        this.identityLoadPromise=this.loadPrivateState(expected,epoch);
        if(!await this.identityLoadPromise)return false;
      }else if(!this.identityReady&&this.identityLoadPromise){
        if(!await this.identityLoadPromise)return false;
      }
      this.identityReady=true;
      if(user.role==='teacher')await this.loadTeacherQuestions(expected,epoch);
      if(user.role==='admin')await this.loadAdminOverview(expected,epoch);
      if(epoch===identityEpoch){this.identityReady=true;this.scrollToLast();}
      return true;
    },
    async loadPrivateState(expected,epoch) {
      try{
        const {response,payload}=await this.isolatedRequest('/api/me/state',{method:'GET'},expected);
        if(epoch!==identityEpoch)return false;
        if(!response.ok)throw new Error(payload.error||'无法读取账号数据。');
        if(payload.userId!==expected)throw Object.assign(new Error('账号已在其他标签页切换，请重新登录。'),{code:'identity_mismatch'});
        const state=payload.state;
        if(!state||!Array.isArray(state.sessions)||!Array.isArray(state.docs))throw new Error('账号数据格式无效。');
        this.sessions=state.sessions.slice(0,20);this.docs=state.docs.slice(0,40);
        for(const d of window.COURSE_DATA.docs){const index=this.docs.findIndex(x=>x.id===d.id);if(index<0)this.docs.push(copy(d));else this.docs[index]=copy(d);}
        this.stateRevision=Number.isSafeInteger(payload.revision)?payload.revision:0;
        const current=this.sessions.find(s=>s.id===state.activeSessionId)||this.sessions[0];
        if(current)this.restoreSession(current);else{this.activeSessionId=uid();this.messages=[];this.chapterId='memory';}
        return true;
      }catch(error){
        if(epoch===identityEpoch&&['identity_expired','identity_mismatch','identity_changed'].includes(error.code)){
          this.clearIsolatedIdentity('账号状态已变化，请重新登录。');
        }else if(epoch===identityEpoch){
          this.resetPrivateState();this.demoUser=null;this.accountId='';this.entryOpen=true;this.loginError=error.message||'无法读取账号数据，请重试。';this.signInRequired=true;
        }
        return false;
      }
    },
    persist() {
      if(this.accountMode==='isolated'){
        const expected=this.accountId, epoch=identityEpoch;
        if(!expected||!this.demoUser||this.demoUser.id!==expected)return false;
        const state={sessions:copy(this.sessions),docs:copy(this.docs),activeSessionId:this.activeSessionId};
        isolatedWriteChain=isolatedWriteChain.then(async()=>{
          if(epoch!==identityEpoch||this.accountId!==expected||this.stateConflict)return;
          const {response,payload}=await this.isolatedRequest('/api/me/state',{method:'PUT',body:JSON.stringify({userId:expected,revision:this.stateRevision,state})},expected);
          if(epoch!==identityEpoch||this.accountId!==expected)return;
          if(response.status===409){
            if(payload.code==='revision_conflict'){
              this.stateConflict=true;this.storageWarning='账号数据已在其他标签页更新；已保留本次修改，刷新后可读取最新版本。';
              this.notify('账号数据发生并发更新，请稍后刷新核对。');return;
            }
            if(['identity_mismatch','identity_changed'].includes(payload.code)){this.clearIsolatedIdentity('账号已在其他标签页切换，请重新登录。');return;}
          }
          if(!response.ok)throw new Error(payload.error||'账号数据暂未保存。');
          if(payload.userId!==expected){this.clearIsolatedIdentity('账号已在其他标签页切换，请重新登录。');return;}
          this.stateRevision=Number.isSafeInteger(payload.revision)?payload.revision:this.stateRevision+1;
          this.storageWarning='';this.stateConflict=false;
        }).catch(error=>{
          if(epoch===identityEpoch&&this.accountId===expected&&error.code!=='identity_expired'&&error.code!=='identity_mismatch'){
            this.storageWarning='账号数据暂未保存；请检查网络后重试。';
          }
        });
        return true;
      }
      try {
        localStorage.setItem(KEY, JSON.stringify({version:1, sessions:this.sessions, docs:this.docs, displayName:this.displayName, role:this.role, entered:!this.entryOpen, activeSessionId:this.activeSessionId}));
        this.storageWarning = '';
        return true;
      } catch (_) {
        this.storageWarning = '浏览器未能保存记录。当前内容仍可使用，刷新后可能丢失；可先选中并复制需要保留的文字。';
        return false;
      }
    },
    async retrySave() {
      if(this.accountMode!=='isolated'||!this.accountId)return;
      if(this.stateConflict){this.notify('另一个标签页已更新账号数据，请刷新后查看最新版本。');return;}
      this.storageWarning='';this.persist();await isolatedWriteChain;
      if(this.storageWarning)this.notify('账号数据仍未保存，请检查网络后重试。');
      else this.notify('账号数据已保存。');
    },
    syncSession() {
      const current = {id:this.activeSessionId, title:this.messages[0]?.question.slice(0,45) || '新对话',chapterId:this.chapterId,messages:this.messages.slice(-40),updatedAt:new Date().toISOString()};
      this.sessions = [current,...this.sessions.filter(s=>s.id!==current.id)].slice(0,20);
    },
    restoreSession(s) {
      this.activeSessionId=s.id; this.chapterId=s.chapterId; this.messages=copy(s.messages);
      this.activeMessageId=this.messages.at(-1)?.id || ''; this.draft='';this.error='';this.view='chat';
    },
    enterDemo() {
      if(this.accountMode==='isolated')return;
      if (this.demoUser) { this.loginError='此账号身份已由体验账号确定，请退出后使用另一身份账号登录。'; this.entryOpen=true; return; }
      this.displayName=this.entryName.trim().slice(0,20) || (this.entryRole==='teacher'?'老师':'同学');
      this.role=this.entryRole==='teacher'?'teacher':'student'; this.entryOpen=false;
      this.view=this.role==='teacher'?'analytics':'chat';this.persist();if(this.view==='chat')this.scrollToLast();
      this.$nextTick(()=>document.querySelector(this.role==='teacher'?'.page-heading h1':'#question-draft')?.focus());
    },
    async loginDemo() {
      if (this.loginBusy) return;
      const username=this.loginUsername.trim(), password=this.loginPassword;
      if(!username||!password){this.loginError='请输入体验账号和密码。';return;}
      this.loginBusy=true;this.loginError='';
      try {
        if(this.accountMode==='isolated'){
          // Drop old in-memory data before credentials can change the shared cookie.
          identityEpoch++;this.identityEpoch=identityEpoch;this.accountId='';this.demoUser=null;this.resetPrivateState();
          const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username,password})});
          const payload=await response.json();
          if(!response.ok||!this.normalizeServerUser(payload?.user))throw new Error(payload?.error||'登录失败，请重试。');
          const user=this.normalizeServerUser(payload.user);this.loginPassword='';
          await this.activateIsolatedUser(user);return;
        }
        const response=await requestWithTimeout('/api/demo/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username,password})});
        const payload=await response.json();
        if(!response.ok||!payload?.user||!['student','teacher'].includes(payload.user.role))throw new Error(payload?.error||'登录失败，请重试。');
        this.demoUser=payload.user;this.loginPassword='';this.displayName=payload.user.displayName||payload.user.username;
        this.role=payload.user.role;this.view=this.role==='teacher'?'analytics':'chat';this.entryOpen=false;this.signInRequired=false;
        this.persist();await this.refreshServiceStatus();this.scrollToLast();
      } catch(error){this.loginError=error?.message||'登录失败，请稍后重试。';}
      finally{this.loginBusy=false;}
    },
    async logoutDemo() {
      if(this.loginBusy)return;
      this.loginBusy=true;
      try {
        if(this.accountMode==='isolated'){
          if(this.storageWarning){this.notify('账号数据尚未确认保存；请先刷新核对或复制需要保留的内容。');return;}
          await isolatedWriteChain;
          if(this.storageWarning){this.notify('账号数据尚未确认保存；请先刷新核对或复制需要保留的内容。');return;}
          const expected=this.accountId;
          identityEpoch++;this.identityEpoch=identityEpoch;
          const response=await fetch('/api/auth/logout',{method:'POST',headers:{Accept:'application/json',...(expected?{'X-Expected-User-Id':expected}:{})}});
          if(response.status===401||response.status===409){this.clearIsolatedIdentity('账号状态已变化，请重新登录。');this.loginUsername='';return;}
          if(!response.ok)throw new Error('logout failed');
          this.clearIsolatedIdentity('请输入管理员创建的账号和密码。');this.loginUsername='';this.loginPassword='';return;
        }
        const response=await requestWithTimeout('/api/demo/logout',{method:'POST',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('logout failed');
        const payload=await response.json();if(payload?.ok!==true)throw new Error('logout failed');
        this.demoUser=null;this.loginPassword='';this.loginUsername='';this.loginError='';this.guestMode=false;this.entryOpen=true;
        this.notify('已退出体验账号；历史仍保存在此浏览器。');this.refreshServiceStatus();
      }
      catch (_) { this.notify('退出请求未能送达，请刷新页面重试。');return; }
      finally {this.loginBusy=false;}
    },
    showEntry() { if(this.accountMode==='isolated'&&this.demoUser){this.notify('请先退出当前账号，再登录其他账号。');return;}this.entryName=this.displayName;this.entryRole=this.role;this.guestMode=false;this.loginError='';this.entryOpen=true;this.$nextTick(()=>document.getElementById(this.demoUser?'entry-return':this.demoLoginEnabled?'demo-username':'entry-name')?.focus()); },
    switchRole(role) {
      if(this.accountMode==='isolated')return;
      if (this.busy) return;
      if(this.demoUser&&role!==this.demoUser.role){this.notify('此体验账号身份固定；请退出后使用另一身份账号登录。');return;}
      this.role=role==='teacher'?'teacher':'student'; this.view=this.role==='teacher'?'analytics':'chat';
      this.persist();this.notify(this.role==='teacher'?'已切换到教师体验':'已切换到学生体验');
    },
    selectChapter(id) {
      if (this.busy || !this.chapters.some(c=>c.id===id)) return;
      if (this.chapterId!==id) {this.chapterId=id;this.newChat();}
      this.view='chat';
    },
    newChat() {
      if (this.busy) return;
      this.messages=[]; this.activeMessageId='';this.activeSessionId=uid();this.draft='';this.error='';this.view='chat';this.sidebarOpen=false;
      this.sourceOpen=false;this.activeSource=null;this.scrollToLast();
      this.$nextTick(()=>document.getElementById('question-draft')?.focus());
    },
    openSession(id) {
      if (this.busy) return;
      const s=this.sessions.find(x=>x.id===id);if (!s) return;
      this.restoreSession(s);this.persist();this.scrollToLast();
    },
    async refreshServiceStatus() {
      try {
        const response=await fetch('/api/health',{headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('health unavailable');
        const data=await response.json();
        if(!data || typeof data.configured!=='boolean' || typeof data.knowledgeCount!=='number')throw new Error('invalid health response');
        if(data.accountMode==='isolated'&&this.accountMode!=='isolated'){
          this.accountMode='isolated';identityEpoch++;this.identityEpoch=identityEpoch;this.resetPrivateState();this.demoUser=null;this.accountId='';this.entryOpen=true;this.identityReady=false;
        }
        if(this.accountMode==='isolated'){
          this.demoLoginEnabled=true;this.serviceModel=typeof data.model==='string'?data.model:'';this.knowledgeCount=data.knowledgeCount;
          this.signInRequired=!data.user;this.serviceStatus=data.configured?`文档检索 · ${this.serviceModel||'DeepSeek'} · 提问会发送至 DeepSeek`:'文档检索可用 · 模型未配置';
          const user=this.normalizeServerUser(data.user);
          if(user){
            if(this.accountId!==user.id||!this.demoUser)await this.activateIsolatedUser(user);
            else if(!this.identityReady&&this.identityLoadPromise){
              const ready=await this.identityLoadPromise;
              if(ready&&this.accountId===user.id){this.identityReady=true;if(user.role==='teacher')await this.loadTeacherQuestions(user.id,identityEpoch);if(user.role==='admin')await this.loadAdminOverview(user.id,identityEpoch);}
            }
            else if(this.demoUser?.role!==user.role){this.clearIsolatedIdentity('账号角色已变更，请重新登录。');}
          }else if(this.demoUser||this.accountId){this.clearIsolatedIdentity('登录已过期，请重新登录。');}
          else this.identityReady=true;
          if(this.entryOpen)this.$nextTick(()=>document.getElementById('demo-username')?.focus());
          return;
        }
        if(!this.identityReady)this.restoreLocalState();
        this.demoLoginEnabled=data.demoLoginEnabled===true;
        const serverUser=data.user&&['student','teacher'].includes(data.user.role)?data.user:null;
        const identityChanged=serverUser&&(!this.demoUser||this.demoUser.username!==serverUser.username||this.demoUser.role!==serverUser.role);
        if(serverUser){
          this.demoUser=serverUser;
          if(identityChanged){this.displayName=serverUser.displayName||serverUser.username;this.role=serverUser.role;this.view=this.role==='teacher'?'analytics':'chat';this.entryOpen=false;this.guestMode=false;}
        }
        if(this.demoLoginEnabled&&this.entryOpen&&!this.demoUser)this.entryRole='student';
        this.serviceModel=typeof data.model==='string'?data.model:'';
        this.knowledgeCount=data.knowledgeCount;
        this.signInRequired=data.requiresSignIn===true;
        this.serviceStatus=data.configured
          ? `文档检索 · ${this.serviceModel || 'DeepSeek'} · 提问会发送至 DeepSeek`
          : '文档检索可用 · 模型未配置';
        if(this.entryOpen)this.$nextTick(()=>document.getElementById(this.demoUser?'entry-return':this.demoLoginEnabled&&!this.guestMode?'demo-username':'entry-name')?.focus());
      } catch (_) {
        if(this.accountMode==='isolated'){this.demoLoginEnabled=true;if(!this.demoUser){this.identityReady=true;this.entryOpen=true;this.loginError='暂时无法连接账号服务，请稍后重试。';}}
        this.serviceStatus='问答服务暂不可用 · 可重试';
      }
    },
    async loadTeacherQuestions(expected=this.accountId, epoch=identityEpoch) {
      if(this.accountMode!=='isolated'||this.role!=='teacher'||!expected)return false;
      try{
        const {response,payload}=await this.isolatedRequest('/api/teacher/questions',{method:'GET'},expected);
        if(epoch!==identityEpoch||this.accountId!==expected)return false;
        if(!response.ok)throw new Error(payload.error||'无法读取班级统计。');
        if(payload.userId!==expected){this.clearIsolatedIdentity('账号已在其他标签页切换，请重新登录。');return false;}
        if(!Array.isArray(payload.sessions)||!Array.isArray(payload.classes))throw new Error('班级统计格式无效。');
        this.teacherSessions=payload.sessions;this.teacherClasses=payload.classes;this.teacherDataLoaded=true;this.analyticsSource='actual';
        return true;
      }catch(error){if(epoch===identityEpoch&&this.accountId===expected)this.storageWarning=error.message||'班级统计暂时无法加载。';return false;}
    },
    async loadAdminOverview(expected=this.accountId, epoch=identityEpoch) {
      if(this.accountMode!=='isolated'||this.role!=='admin'||!expected)return false;
      this.adminLoading=true;
      try{
        const {response,payload}=await this.isolatedRequest('/api/admin/overview',{method:'GET'},expected);
        if(epoch!==identityEpoch||this.accountId!==expected)return false;
        if(!response.ok)throw new Error(payload.error||'无法读取账号管理数据。');
        if(payload.userId!==expected){this.clearIsolatedIdentity('账号已在其他标签页切换，请重新登录。');return false;}
        this.adminUsers=Array.isArray(payload.users)?payload.users:[];this.adminClasses=Array.isArray(payload.classes)?payload.classes:[];
        this.adminMemberships=Array.isArray(payload.memberships)?payload.memberships:[];return true;
      }catch(error){if(epoch===identityEpoch&&this.accountId===expected)this.notify(error.message||'账号管理数据暂时无法加载。');return false;}
      finally{this.adminLoading=false;}
    },
    async adminRequest(path, body, method='POST') {
      if(this.accountMode!=='isolated'||this.role!=='admin'||!this.accountId)return false;
      const expected=this.accountId,epoch=identityEpoch;
      try{
        const {response,payload}=await this.isolatedRequest(path,{method,body:body===undefined?undefined:JSON.stringify(body)},expected);
        if(epoch!==identityEpoch||this.accountId!==expected)return false;
        if(!response.ok)throw new Error(payload.error||'操作未能完成。');
        if(payload.userId&&payload.userId!==expected){this.clearIsolatedIdentity('账号已在其他标签页切换，请重新登录。');return false;}
        await this.loadAdminOverview(expected,epoch);this.notify('已保存。');return true;
      }catch(error){if(epoch===identityEpoch&&this.accountId===expected)this.notify(error.message||'操作未能完成。');return false;}
    },
    async createAccount() {
      const input=this.newAccount;
      if(!input.username||!input.password||!input.displayName){this.notify('请填写账号、姓名和初始密码。');return;}
      const ok=await this.adminRequest('/api/admin/users',{username:input.username.trim(),password:input.password,displayName:input.displayName.trim(),role:input.role});
      if(ok)this.newAccount={username:'',displayName:'',password:'',role:'student'};
    },
    async createClass() {
      if(!this.newClassName.trim()){this.notify('请输入班级名称。');return;}
      if(await this.adminRequest('/api/admin/classes',{name:this.newClassName.trim()}))this.newClassName='';
    },
    async assignClass() {
      if(!this.assignClassId||!this.assignUserId){this.notify('请选择班级和教师或学生账号。');return;}
      const ok=await this.adminRequest('/api/admin/memberships',{classId:this.assignClassId,userId:this.assignUserId});
      if(ok){this.assignClassId='';this.assignUserId='';}
    },
    async removeClassMembership(classId,userId) {
      return this.adminRequest('/api/admin/memberships',{classId,userId},'DELETE');
    },
    normalizeAnswer(payload) {
      if(!payload || !payload.answer || !Array.isArray(payload.sources))throw new Error('bad response');
      const a=payload.answer;
      if(!Array.isArray(a.paragraphs)||!Array.isArray(a.bullets)||!Array.isArray(a.sourceIds)||!Array.isArray(a.followups))throw new Error('bad response');
      const sources=payload.sources.filter(s=>s&&typeof s.id==='string'&&typeof s.title==='string'&&typeof s.text==='string').map(s=>({
        id:s.id,title:s.title,chapterId:'memory',section:typeof s.section==='string'?s.section:'课程资料',text:s.text,
        sourceId:typeof s.sourceId==='string'?s.sourceId:'',sourceFile:typeof s.sourceFile==='string'?s.sourceFile:'',
        enabled:true,custom:false,origin:typeof s.origin==='string'?s.origin:'archive'
      }));
      const available=new Set(sources.map(s=>s.id));
      if(a.sourceIds.some(id=>typeof id!=='string'||!available.has(id)))throw new Error('invalid citations');
      const strings=xs=>xs.every(x=>typeof x==='string');
      if(!strings(a.paragraphs)||!strings(a.bullets)||!strings(a.followups)||typeof a.supported!=='boolean')throw new Error('bad response');
      const sectionKinds=new Set(['course','general','notice']);
      let sections=[];
      if(a.sections!==undefined){
        if(!Array.isArray(a.sections)||a.sections.length>4||!['course','general','mixed','insufficient'].includes(a.basis))throw new Error('bad response');
        sections=a.sections.map(section=>{
          if(!section||!sectionKinds.has(section.kind)||!Array.isArray(section.paragraphs)||!Array.isArray(section.bullets)||!strings(section.paragraphs)||!strings(section.bullets)||section.paragraphs.length>6||section.bullets.length>6)throw new Error('bad response');
          return {kind:section.kind,paragraphs:section.paragraphs.slice(0,6),bullets:section.bullets.slice(0,6)};
        });
      }
      return {answer:{
        paragraphs:a.paragraphs.slice(0,6),bullets:a.bullets.slice(0,8),sourceIds:a.sourceIds.slice(0,6),
        value:typeof a.value==='string'?a.value:'',valueTitle:typeof a.valueTitle==='string'?a.valueTitle:'',
        valueRevision:Number.isInteger(a.valueRevision)?a.valueRevision:2,followups:a.followups.slice(0,3),
        supported:a.supported,label:typeof a.label==='string'?a.label:'课程问答',topic:typeof a.topic==='string'?a.topic:'',
        mode:a.mode==='model'?'model':'retrieval',basis:sections.length?a.basis:'',sections
      },sources};
    },
    appendAnswer(question, result, save=true) {
      const answer=result.answer;
      const sources=result.sources.filter(d=>answer.sourceIds.includes(d.id)).map(copy);
      const now=new Date();
      const message={id:uid(),question,answer,sources,time:now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),createdAt:now.toISOString(),authorRole:this.role,isDemo:false,feedback:''};
      this.messages=[...this.messages.slice(-39),message];this.activeMessageId=message.id;
      this.syncSession(); if(save)this.persist();
    },
    async send(question) {
      if(this.busy)return;
      const text=(typeof question==='string'?question:this.draft).trim();
      if(!text){this.error='先输入一个课程问题。';return;}
      if(text.length>1000){this.error='问题请控制在 1000 字以内。';return;}
      if(this.accountMode==='isolated'&&(!this.accountId||!this.demoUser)){this.clearIsolatedIdentity('请先登录，再提交课程问题。');return;}
      this.busy=true;this.error='';this.view='chat';
      this.signInRequired=false;
      const expected=this.accountMode==='isolated'?this.accountId:'';
      const sendEpoch=identityEpoch;
      const history=this.messages.slice(-4).map(m=>({question:m.question,answer:[...(m.answer.paragraphs||[]),...(m.answer.bullets||[])].join('\n').slice(0,1600)}));
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),65000);
      try {
        const headers={'Content-Type':'application/json','Accept':'application/json'};
        if(expected)headers['X-Expected-User-Id']=expected;
        const response=await fetch('/api/chat',{method:'POST',headers,body:JSON.stringify({question:text,history}),signal:controller.signal});
        let payload;
        try {payload=await response.json();} catch (_) {throw new Error('invalid response');}
        if(expected&&(sendEpoch!==identityEpoch||expected!==this.accountId))throw Object.assign(new Error('账号已切换，已丢弃旧请求结果。'),{code:'stale_identity'});
        if(response.status===409&&['identity_mismatch','identity_changed'].includes(payload?.code)){
          this.clearIsolatedIdentity('此浏览器中的账号已在其他标签页切换，请重新登录。');
          throw new Error('账号已在其他标签页切换，请重新登录。');
        }
        if(response.status===401&&payload?.code==='sign_in_required'){
          this.signInRequired=true;
          if(this.accountMode==='isolated')this.clearIsolatedIdentity('登录已过期，请重新登录。');
          else if(this.demoLoginEnabled){this.demoUser=null;this.guestMode=false;this.loginError='请登录体验账号后继续；也可使用 ChatGPT 登录。';this.entryOpen=true;this.$nextTick(()=>document.getElementById('demo-username')?.focus());}
          throw new Error('请先登录，再使用 DeepSeek 模型问答。');
        }
        if(response.status===401&&this.accountMode==='isolated')this.clearIsolatedIdentity('登录已过期，请重新登录。');
        if(!response.ok)throw new Error(typeof payload?.error==='string'?payload.error:'问答服务暂不可用，请重试。');
        if(expected&&(sendEpoch!==identityEpoch||expected!==this.accountId))throw Object.assign(new Error('账号已切换，已丢弃旧请求结果。'),{code:'stale_identity'});
        const result=this.normalizeAnswer(payload);
        this.appendAnswer(text,result);if(this.draft===text||!question)this.draft='';this.scrollToLast();
        this.refreshServiceStatus();
      } catch (error) {
        if(error?.code==='stale_identity')return;
        this.error=error?.name==='AbortError'?'回答超时，请稍后重试。你的问题已保留。':(error?.message==='Failed to fetch'?'问答服务连接失败，请确认服务已启动后重试。':error?.message==='invalid response'||error?.message==='bad response'||error?.message==='invalid citations'?'问答服务返回了无法识别的结果，请重试。':error?.message||'本次回答未完成，请重试。');
        if(!this.draft&&(!expected||this.accountId===expected))this.draft=text;
      }
      finally {clearTimeout(timeout);this.busy=false;}
    },
    scrollToLast() {this.$nextTick(()=>{const box=document.querySelector('.chat-scroll');if(box)box.scrollTo({top:this.messages.length<=1?0:box.scrollHeight,behavior:this.messages.length<=1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});},
    selectMessage(id) {if(this.messages.some(m=>m.id===id))this.activeMessageId=id;},
    docById(id, messageId=this.activeMessageId) {return this.messages.find(m=>m.id===messageId)?.sources?.find(d=>d.id===id) || this.docs.find(d=>d.id===id);},
    showSource(id) {
      const d=this.docById(id);if(!d){this.notify('这条回答没有可打开的资料。');return;}
      if(!this.sourceOpen)returnFocus=document.activeElement;this.activeSource=copy(d);this.sourceOpen=true;
      this.$nextTick(()=>document.querySelector('.source-dialog button')?.focus());
    },
    closeSource() {this.sourceOpen=false;this.activeSource=null;this.$nextTick(()=>returnFocus?.focus?.());},
    async setFeedback(id,value) {
      const m=this.messages.find(x=>x.id===id);if(!m)return;
      m.feedback=m.feedback===value?'':value;this.syncSession();
      if(!this.persist())return;
      if(this.accountMode==='isolated'){
        await isolatedWriteChain;
        if(this.storageWarning){this.notify('反馈暂未保存，请确认网络后重试。');return;}
      }
      this.notify(this.accountMode==='isolated'?(m.feedback?'反馈已保存到个人账号':'已取消这条反馈'):(m.feedback?'反馈已保存在当前浏览器':'已取消这条反馈'));
    },
    async exportChat() {
      const text=this.messages.map(m=>{
        const a=m.answer;
        const body=a.sections?.length?a.sections.map(section=>{
          const label=section.kind==='general'?'通用知识讲解':section.kind==='course'?'课程资料':'说明';
          return label+'：\n'+[...section.paragraphs,...section.bullets].join('\n');
        }).join('\n'):[...a.paragraphs,...a.bullets].join('\n');
        return '问题：'+m.question+'\n'+body+(a.value?'\n'+(a.valueTitle||'课程拓展')+'：'+a.value:'')+'\n回答模式：'+(a.mode==='model'?'DeepSeek 模型回答':a.mode==='retrieval'?'文档检索':'历史预置回答')+'\n课程资料引用：'+(m.sources.map(d=>d.title+' / '+d.section).join('；')||'无（通用知识讲解或未检索到资料）')+'\n';
      }).join('\n');
      try {await navigator.clipboard.writeText('知芯 · 计算机组成原理课程助教\n\n'+text);this.notify('对话已复制，可粘贴到文档中。');}
      catch (_) {this.notify('无法访问剪贴板，请选中页面文字复制。');}
    },
    async exportAnalyticsReport() {
      if(this.role!=='teacher' || this.reportExporting)return;
      this.reportExporting=true;
      let url, link;
      try {
        const generatedAt=new Date();
        const source=this.accountMode==='isolated'?'authorized-classes':this.analyticsSource;
        const scopeLabel=this.accountMode==='isolated'?this.teacherClasses.map(item=>item.name).join('、'):'本机记录';
        const blob=window.CourseReport.create({analytics:this.analytics,source,scopeLabel,range:this.analyticsRange,category:this.analyticsFilter,generatedAt});
        url=URL.createObjectURL(blob);
        link=document.createElement('a');link.href=url;link.download=window.CourseReport.filename(generatedAt);
        document.body.appendChild(link);link.click();
        this.notify('Word 报告已生成，请查看浏览器下载。');
      } catch (_) {this.notify('报告生成失败，请重试；当前数据和筛选已保留。');}
      finally {link?.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),30000);this.reportExporting=false;}
    },
    notify(text) {clearTimeout(toastTimer);this.toast=text;toastTimer=setTimeout(()=>this.toast='',4000);},
    closeToast() {clearTimeout(toastTimer);this.toast='';},
    setAnalyticsSource(source) {
      if(this.role!=='teacher')return;
      if(this.accountMode==='isolated'){this.analyticsSource='actual';this.analyticsFilter='all';return;}
      this.analyticsSource=source==='sample'?'sample':'actual';this.analyticsFilter='all';
    },
    setAnalyticsFilter(id) {
      if(this.role!=='teacher')return;
      this.analyticsFilter=this.analyticsFilter===id?'all':id;
    }
  };
};
