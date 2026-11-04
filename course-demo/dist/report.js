/* Browser-only OOXML report export. No external libraries or server calls. */
(function (root) {
  const esc = value => String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const validRanges = { all: '全部记录', 7: '最近 7 天', 30: '最近 30 天' };
  const pad = n => String(n).padStart(2, '0');
  function dateLabel(value) {
    const d = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(d.getTime())) return '时间未知';
    return `${d.getFullYear()}年${pad(d.getMonth()+1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function filename(value) {
    const d = value instanceof Date ? value : new Date(value || Date.now());
    const stamp = Number.isFinite(d.getTime()) ? `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}` : '未知时间';
    return `教学数据总结_${stamp}.docx`;
  }
  function xmlRun(text, opts={}) {
    const font=opts.font||'等线', size=opts.size||21, color=opts.color||'26352C';
    return `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/>${opts.bold?'<w:b/>':''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }
  function para(text='', opts={}) {
    const ppr=`<w:pPr>${opts.style?`<w:pStyle w:val="${opts.style}"/>`:''}${opts.after!=null?`<w:spacing w:after="${opts.after}"/>`:''}${opts.align?`<w:jc w:val="${opts.align}"/>`:''}</w:pPr>`;
    return `<w:p>${ppr}${xmlRun(text,opts)}</w:p>`;
  }
  function table(headers, rows, widths) {
    const all=[headers,...rows];
    const border='<w:tblBorders><w:top w:val="single" w:sz="5" w:color="D9E1DA"/><w:left w:val="single" w:sz="5" w:color="D9E1DA"/><w:bottom w:val="single" w:sz="5" w:color="D9E1DA"/><w:right w:val="single" w:sz="5" w:color="D9E1DA"/><w:insideH w:val="single" w:sz="5" w:color="D9E1DA"/><w:insideV w:val="single" w:sz="5" w:color="D9E1DA"/></w:tblBorders>';
    const grid=widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('');
    const trs=all.map((row,ri)=>`<w:tr><w:trPr>${ri===0?'<w:tblHeader w:val="true"/>':''}<w:cantSplit/></w:trPr>${row.map((cell,ci)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/><w:vAlign w:val="center"/>${ri===0?'<w:shd w:fill="315B43"/>':''}<w:tcMar><w:top w:w="95" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="95" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${xmlRun(cell,{size:ri===0?19:18,bold:ri===0,color:ri===0?'FFFFFF':'26352C'})}</w:p></w:tc>`).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/>${border}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>`;
  }
  function buildXml({analytics,source,scopeLabel,range,category,generatedAt}) {
    const a=analytics||{}, rangeText=validRanges[String(range)]||validRanges.all;
    const sourceText=source==='sample'?'演示数据（仅用于展示，不代表真实学生情况）':source==='authorized-classes'?`教师已授权班级：${scopeLabel||'暂无班级'}（由服务器按班级权限汇总）`:'本机记录（仅当前浏览器保留的数据，不代表全班）';
    const categoryEntry=(a.categories||[]).find(c=>c.id===category);
    const categoryText=!category||category==='all'?'全部分类':(categoryEntry?.label||String(category));
    const questions=(a.questions||[]).filter(q=>!category||category==='all'||q.categoryId===category);
    const observations=[a.summary||'当前范围内没有可汇总的提问。','分类按关键词规则归纳，仅供教学参考；少量提问可能未能识别或归入“其他”。','关键词次数表示包含该关键词的提问数，同一提问对同一关键词最多计一次。','当前导出类别仅用于筛选高频问题列表；分类分布、关键词和本期观察仍显示全范围结果。'];
    if(source==='actual') observations.push('本机统计仅包含当前浏览器保留的最近 20 个对话、每个最多 40 轮；新记录排除教师试问。');
    if(source==='authorized-classes') observations.push(`统计范围为教师当前获授权的班级：${scopeLabel||'暂无班级授权'}。数据由服务器按班级关系筛选，仅计入学生提问。`);
    if(a.untimedCount) observations.push(`日期提示：${a.untimedCount} 条记录缺少可用日期${String(range)==='all'?'，仍纳入全部记录。':'，未纳入所选时间范围。'}`);
    if(source==='actual'&&a.legacyRoleCount) observations.push(`身份提示：${a.legacyRoleCount} 条旧版记录未标记身份，已纳入本机记录统计。`);
    const cats=(a.categories||[]).map(c=>[c.label,String(c.count),`${c.percent}%`]);
    const kws=(a.keywords||[]).map(k=>[k.text,String(k.count)]);
    const qs=questions.map(q=>[q.question,String(q.count),q.categoryLabel]);
    const content=[
      para('教学数据总结',{style:'Title',size:34,bold:true,color:'000000',after:120}),
      para('计算机组成原理课程问题分布与教学参考',{size:22,color:'405248',after:160}),
      para(`生成时间：${dateLabel(generatedAt)}`,{size:19}),
      para(`统计来源：${sourceText}`,{size:19}),
      para(`统计时间：${rangeText}${String(range)==='7'?'（统计时刻向前 168 小时）':String(range)==='30'?'（统计时刻向前 720 小时）':'（纳入来源可用的全部保留记录）'}`,{size:19}),
      para(`高频问题筛选：${categoryText}（仅筛选问题榜）`,{size:19,after:260}),
      para('核心指标',{style:'Heading1',size:27,bold:true,color:'000000',after:110}),
      table(['指标','数值','说明'],[
        ['学生提问数',String(a.total||0),'所选来源与时间范围内'],
        ['涉及分类数',String((a.categories||[]).filter(c=>c.count>0).length),'含其他 / 待归类问题'],
        ['暂未解答',String(a.unresolvedCount||0),'按回答标记统计，含旧版资料不足回答']
      ],[2200,1500,5660]),
      para('问题分类分布',{style:'Heading1',size:27,bold:true,color:'000000',after:110}),
      table(['问题类别','提问数','占比'],cats.length?cats:[['暂无数据','0','0%']],[4800,1900,2660]),
      para('问题关键词',{style:'Heading1',size:27,bold:true,color:'000000',after:110}),
      para('按包含关键词的提问数降序列出；同数时按关键词名称排序。',{size:18,color:'53645A',after:90}),
      table(['关键词','提问数'],kws.length?kws:[['暂无关键词','0']],[6500,2860]),
      para('高频问题',{style:'Heading1',size:27,bold:true,color:'000000',after:110}),
      table(['问题','提问数','类别'],qs.length?qs:[['当前筛选下暂无可展示的问题','0','—']],[5660,1500,2200]),
      para('教学观察与统计口径',{style:'Heading1',size:27,bold:true,color:'000000',after:110}),
      ...observations.map((line,i)=>para(`${i+1}. ${line}`,{size:19,after:80}))
    ].join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${content}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }
  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files) {
    const enc=new TextEncoder(), local=[], central=[];let offset=0;
    for(const [name,content] of Object.entries(files)){
      const n=enc.encode(name), data=enc.encode(content), crc=crc32(data), l=new Uint8Array(30+n.length+data.length),lv=new DataView(l.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,n.length,true);l.set(n,30);l.set(data,30+n.length);local.push(l);
      const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=l.length;
    }
    const centralSize=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  }
  function create(options) {
    const documentXml=buildXml(options||{});
    return zip({
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="等线" w:hAnsi="等线" w:eastAsia="等线"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/><w:keepNext/></w:pPr></w:style></w:styles>',
      'word/document.xml':documentXml
    });
  }
  root.CourseReport={create,filename};
})(window);
