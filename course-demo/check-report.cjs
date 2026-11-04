const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { window: {}, TextEncoder, Blob, Uint8Array, Uint32Array, DataView };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/report.js'), 'utf8'), sandbox);
const report = sandbox.window.CourseReport;
function unzipStore(blob) {
  const bytes = new Uint8Array(blob), view = new DataView(blob), decoder = new TextDecoder();
  const files = new Map(); let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const method=view.getUint16(offset+8,true), size=view.getUint32(offset+18,true);
    const nameLen=view.getUint16(offset+26,true), extraLen=view.getUint16(offset+28,true);
    assert.equal(method, 0, 'DOCX uses supported ZIP store compression');
    const name=decoder.decode(bytes.slice(offset+30,offset+30+nameLen));
    const start=offset+30+nameLen+extraLen;
    files.set(name, decoder.decode(bytes.slice(start,start+size)));
    offset=start+size;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50,'central directory follows local records');
  return files;
}

(async()=>{
  assert.equal(report.filename(new Date('2026-10-30T04:05:00Z')), '教学数据总结_20261030_1205.docx');
  const sourceText='Cache <script>alert("x")</script> & 处理器';
  const analytics={
    total:3,sessionCount:2,unresolvedCount:1,untimedCount:1,legacyRoleCount:1,
    summary:'最近 7 天共统计 3 条学生提问。',
    categories:[{id:'memory',label:'存储系统',count:2,percent:66.7},{id:'other',label:'其他/待归类',count:1,percent:33.3}],
    keywords:[{text:'Cache',count:2},{text:'RAM',count:1}],
    questions:[
      {question:sourceText,count:2,categoryId:'memory',categoryLabel:'存储系统'},
      {question:'天气如何？',count:1,categoryId:'other',categoryLabel:'其他/待归类'}
    ]
  };
  const blob=await report.create({analytics,source:'actual',range:'7',category:'memory',generatedAt:'2026-10-30T04:05:00Z'});
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const files=unzipStore(await blob.arrayBuffer());
  for(const file of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/_rels/document.xml.rels']) assert(files.has(file),`contains ${file}`);
  const xml=files.get('word/document.xml');
  assert.match(xml,/<w:pgSz w:w="11906" w:h="16838"\/>/,'uses A4 page dimensions');
  assert.match(xml,/本机记录（仅当前浏览器保留的数据，不代表全班）/);
  assert.match(xml,/最近 7 天（统计时刻向前 168 小时）/);
  assert.match(xml,/仅筛选问题榜/);
  assert.match(xml,/关键词次数表示包含该关键词的提问数/);
  assert.match(xml,/按包含关键词的提问数降序列出/);
  assert.match(xml,/<w:tblHeader w:val="true"\/>/,'every table has a repeating header row');
  assert.match(xml,/<w:cantSplit\/>/,'table rows cannot split across pages');
  assert.match(xml,/排除教师试问/);
  assert.match(xml,/1 条记录缺少可用日期/);
  assert.match(xml,/1 条旧版记录未标记身份/);
  assert.match(xml,/Cache &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; 处理器/);
  assert.doesNotMatch(xml,/<script>/);
  assert.doesNotMatch(xml,/天气如何？/,'question table uses the selected category');
  const sampleXml=await filesFrom(await report.create({analytics,source:'sample',range:'all',category:'cpu',generatedAt:'bad-date'}));
  assert.match(sampleXml,/高频问题筛选：cpu/);
  assert.match(sampleXml,/仅筛选问题榜/);
  assert.match(sampleXml,/演示数据（仅用于展示/);
  assert.match(sampleXml,/当前筛选下暂无可展示的问题/);
  assert.match(sampleXml,/时间未知/);
  const empty=await filesFrom(await report.create({analytics:{categories:[],keywords:[],questions:[]},source:'actual',range:'all',category:'all'}));
  assert.match(empty,/暂无数据/);
  assert.match(empty,/暂无关键词/);
  if(process.argv.includes('--write-demo')){
    const analyticsSandbox={window:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'dist/analytics.js'),'utf8'),analyticsSandbox);
    const now=new Date('2026-10-30T12:00:00+08:00');
    const demoAnalytics=analyticsSandbox.window.CourseAnalytics.build(analyticsSandbox.window.CourseAnalytics.sampleSessions(now),{range:'all',now});
    const demoBlob=report.create({analytics:demoAnalytics,source:'sample',range:'all',category:'all',generatedAt:now});
    const dest=path.join(__dirname,'evidence','report','demo.docx');
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,Buffer.from(await demoBlob.arrayBuffer()));
    console.log(`wrote fixed demo report: ${dest}`);
  }
  console.log('report checks passed: DOCX ZIP package, A4 OOXML, escaping, metrics, scope notes, source labels and empty data');
})().catch(error=>{console.error(error);process.exitCode=1;});

function filesFrom(blob) {
  return blob.arrayBuffer().then(buffer=>unzipStore(buffer).get('word/document.xml'));
}
