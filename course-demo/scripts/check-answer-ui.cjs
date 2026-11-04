const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

(async()=>{
const copied=[];
const persisted={};
const context=vm.createContext({
  window:{COURSE_DATA:{chapters:[{id:'memory'}],docs:[]},CourseAnalytics:{sampleSessions:()=>[]},crypto:require('node:crypto').webcrypto,matchMedia:()=>({matches:true})},
  document:{addEventListener(){},querySelector(){return null;},getElementById(){return null;}},
  navigator:{clipboard:{writeText:async text=>copied.push(text)}},
  localStorage:{getItem(key){return persisted[key]||null;},setItem(key,value){persisted[key]=value;}},
  Date,console,setTimeout,clearTimeout,
});
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
const app=context.window.eduApp();
const source={id:'course-1',title:'课程大纲',section:'存储系统',text:'课程要求分析Cache性能参数。'};
const response=(answer,sources=[source])=>({answer:{supported:true,paragraphs:['Cache用于缩小处理器与主存的速度差距。','本课程要求分析Cache性能参数。'],bullets:[],sourceIds:['course-1'],followups:[],mode:'model',label:'DeepSeek · 资料问答',...answer},sources});

let parsed=app.normalizeAnswer(response({basis:'mixed',sections:[
  {kind:'general',paragraphs:['Cache利用访问局部性缓存近期数据。'],bullets:['命中时减少平均访存时间。']},
  {kind:'course',paragraphs:['课程要求分析Cache性能参数。'],bullets:[]},
]}));
assert.equal(parsed.answer.sections[0].kind,'general');
assert.equal(parsed.answer.sections[1].kind,'course');
assert.deepEqual(Array.from(parsed.answer.sourceIds),['course-1']);
assert.equal(parsed.answer.basis,'mixed');
const mixed=parsed;

parsed=app.normalizeAnswer(response({basis:'general',sections:[{kind:'general',paragraphs:['Cache利用时间局部性和空间局部性'],bullets:[]}],paragraphs:['Cache利用时间局部性和空间局部性'],sourceIds:[]},[]));
assert.equal(parsed.answer.basis,'general');
assert.equal(parsed.answer.sourceIds.length,0);

const old=app.normalizeAnswer(response({basis:undefined,sections:undefined}));
assert.equal(old.answer.sections.length,0);
assert.equal(old.answer.basis,'');
assert.throws(()=>app.normalizeAnswer(response({basis:'mixed',sections:[{kind:'unverified',paragraphs:['x'],bullets:[]}]})),/bad response/);

const mixedMessage={id:'mixed',question:'Cache与课程要求',answer:{...mixed.answer},sources:[source],time:'09:00',createdAt:'2026-11-03T01:00:00Z'};
const generalMessage={id:'general',question:'为什么需要Cache？',answer:{...parsed.answer,basis:'general',sourceIds:[],sections:[{kind:'general',paragraphs:['Cache利用时间局部性和空间局部性'],bullets:[]}],paragraphs:['Cache利用时间局部性和空间局部性']},sources:[],time:'09:01',createdAt:'2026-11-03T01:01:00Z'};
app.$nextTick=fn=>fn();app.sessions=[{id:'session',title:'Cache',chapterId:'memory',messages:[mixedMessage,generalMessage]}];
app.activeSessionId='session';app.role='student';app.displayName='同学';app.entryOpen=false;app.persist();
const restored=context.window.eduApp();restored.$nextTick=fn=>fn();restored.init();
assert.equal(restored.messages[0].answer.basis,'mixed');
assert.equal(restored.messages[0].answer.sections[0].kind,'general');
assert.equal(restored.messages[0].answer.sections[1].kind,'course');
assert.equal(restored.messages[1].answer.basis,'general');
assert.equal(restored.messages[1].answer.sections[0].kind,'general');

app.messages=[{question:'为什么需要Cache？',answer:{...parsed.answer,value:'',paragraphs:['Cache利用时间局部性和空间局部性'],bullets:[],mode:'model'},sources:[]}];
await app.exportChat();
assert.match(copied[0],/通用知识讲解/);
assert.match(copied[0],/课程资料引用：无/);
assert.doesNotMatch(copied[0],/课程大纲/);
assert.match(copied[0],/\n/,'export should contain real line breaks');
assert.ok(!copied[0].includes('\\n'),'export should not contain literal backslash-n text');

console.log('answer UI checks passed: sourced and general sections, persistence, legacy fallback, unknown-section rejection and newline/provenance-aware export');
})().catch(error=>{console.error(error);process.exitCode=1;});
