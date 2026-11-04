import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = dirname(here);
const outDir = join(here, 'generated');
const teachingDesignPages = new Map([[9, [
  ['system', '计算机系统'], ['arithmetic', '运算器'],
]], [10, [
  ['memory', '存储系统'], ['instruction', '指令系统'],
]], [11, [
  ['cpu', 'CPU与整机系统'],
]]]);
const MAX_CHARS = 1200;

function redact(text) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已脱敏]')
    .replace(/(?<!\d)(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d){8}(?!\d)/g, '[电话已脱敏]')
    .replace(/(?<!\d)\d{3,4}[- ]?\d{7,8}(?!\d)/g, '[电话已脱敏]')
    .trim();
}

function chunkText(text, max = MAX_CHARS) {
  const pieces = [];
  // PDF line breaks come from layout wrapping, not reliable paragraph boundaries.
  const normalized = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  for (const paragraph of normalized.split(/(?<=[。！？；])\s*/).map(s => s.trim()).filter(Boolean)) {
    if (paragraph.length <= max) { pieces.push(paragraph); continue; }
    let rest = paragraph;
    while (rest.length > max) {
      let cut = rest.lastIndexOf('。', max);
      if (cut < max * 0.55) cut = rest.lastIndexOf('；', max);
      if (cut < max * 0.55) cut = max;
      else cut += 1;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  return pieces;
}

function applicationSection(chunk) {
  if (!Number.isInteger(chunk.page)) return '';
  let text = chunk.text || '';
  if (chunk.page === 5) {
    const start = text.indexOf('3．课程建设思路');
    if (start < 0) return '';
    text = text.slice(start);
  } else if (chunk.page === 6 || chunk.page === 7) {
    // These pages continue section 3; section 4 starts on page 8.
  } else if (chunk.page >= 9 && chunk.page <= 11) {
    if (chunk.page === 9) {
      const start = text.indexOf('5.课程思政建设示范课程教学设计表');
      if (start < 0) return '';
      text = text.slice(start);
    } else if (chunk.page === 11) {
      const end = text.indexOf('1. 课程目标：');
      if (end >= 0) text = text.slice(0, end);
    }
  } else return '';
  return text;
}

function designRows(text, page) {
  const normalized = text.replace(/\s+/g, '').trim();
  const split = page === 9 ? normalized.split(/(?=3-6)/)
    : page === 10 ? normalized.split(/(?=11-13)/) : [normalized];
  return split.filter(part => part.trim());
}

function teachingPoint(text) {
  const compact = text.replace(/\s+/g, '');
  const start = compact.search(/1[.．、]航天/);
  const next = compact.slice(start).search(/1[.．、]?(?:图像展示|案例分析|案例导入|案例讨论|案例解析|案例讲授)/);
  if (start < 0 || next < 1) throw new Error('Teaching design row boundaries changed; inspect original table.');
  return compact.slice(start, start + next);
}

const chunks = (await readFile(join(dataDir, 'chunks.jsonl'), 'utf8'))
  .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const sources = JSON.parse(await readFile(join(dataDir, 'sources.json'), 'utf8')).sources;
const sourceMap = new Map(sources.map(s => [s.id, s]));
const docs = [];
const tableHeaders = new Map();

const candidates = [];
for (const chunk of chunks) {
  if (chunk.source_id === 'application-2025' && !applicationSection(chunk)) continue;
  const tableMatch = chunk.id.match(/^(.*)-t(\d+)-r(\d+)$/);
  if (tableMatch && tableMatch[3] === '001' && Array.isArray(chunk.cells)) {
    tableHeaders.set(`${tableMatch[1]}-t${tableMatch[2]}`, chunk.cells.map(redact).join(' | '));
  }
}

for (const chunk of chunks) {
  const source = sourceMap.get(chunk.source_id);
  if (!source) continue;
  const tableMatch = chunk.id.match(/^(.*)-t(\d+)-r(\d+)$/);
  if (chunk.source_id === 'syllabus-2024' && !(tableMatch?.[2] === '02')) continue;
  if (chunk.source_id === 'application-2025' && !applicationSection(chunk)) continue;
  const tableKey = tableMatch ? `${tableMatch[1]}-t${tableMatch[2]}` : '';
  let text = redact(chunk.source_id === 'application-2025' ? applicationSection(chunk) : (chunk.text || ''));
  if (tableMatch && tableMatch[3] !== '001' && tableHeaders.has(tableKey)) {
    text = `表格列名：${tableHeaders.get(tableKey)}\n本行：${text}`;
  }
  if (!text || (tableMatch && tableMatch[3] === '001')) continue;
  if (chunk.source_id === 'application-2025' && teachingDesignPages.has(chunk.page)) {
    const rows = designRows(text, chunk.page);
    for (const [index, row] of rows.entries()) {
      const metadata = teachingDesignPages.get(chunk.page)[index];
      if (!metadata) continue;
      const point = teachingPoint(row);
      const normalized = row.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
      candidates.push({
        id: `${chunk.id}-teaching-${metadata[0]}`, title: source.kind, section: `PDF物理页 ${chunk.page} · ${metadata[1]}`,
        text: normalized, sourceId: source.id, sourceFile: source.retained_path, sourceKind: source.kind,
        locator: `PDF物理页 ${chunk.page} · ${metadata[1]}`, contentRole: 'course_teaching_design_reference',
        teachingTopic: metadata[0], teachingPoint: point,
      });
    }
    continue;
  }
  const syllabusTopic = chunk.source_id === 'syllabus-2024' ? ({'002':'system','003':'arithmetic','004':'memory','005':'instruction','006':'cpu'})[tableMatch?.[3]] : undefined;
  const syllabusPoint = syllabusTopic ? text.match(/课程思政融入点\s*[：:]\s*([\s\S]*?)(?:\n\s*\||$)/)?.[1]?.trim() : '';
  const pieces = chunk.source_id === 'application-2025' ? chunkText(text) : [text];
  pieces.forEach((piece, index) => {
    const locator = chunk.page
      ? `PDF物理页 ${chunk.page}${pieces.length > 1 ? ` · 段 ${index + 1}` : ''}`
      : `${chunk.locator}${pieces.length > 1 ? ` · 片段 ${index + 1}` : ''}`;
    candidates.push({
      id: `${chunk.id}${pieces.length > 1 ? `-part${index + 1}` : ''}`,
      title: source.kind,
      section: locator,
      text: piece,
      sourceId: source.id,
      sourceFile: source.retained_path,
      sourceKind: source.kind,
      locator,
      contentRole: chunk.source_id === 'application-2025' ? 'extracted_text_whitespace_normalized' : 'reference_text_untrusted_data',
      ...(syllabusPoint ? {teachingTopic: syllabusTopic, teachingPoint: syllabusPoint} : {}),
    });
  });
}

// Keep neighboring short syllabus paragraphs together (e.g. course code, credits,
// workload and issue date), while preserving each source locator in the citation.
let group = [];
const flush = () => {
  if (!group.length) return;
  const first = group[0];
  const joinedText = group.map(item => item.text).join('\n');
  docs.push({ ...first, id: group.length === 1 ? first.id : `${first.id}-group`,
    section: [...new Set(group.map(item => item.section))].join('；'),
    locator: [...new Set(group.map(item => item.locator))].join('；'), text: joinedText });
  group = [];
};
for (const item of candidates) {
  const prior = group.at(-1);
  const continuousParagraphs = prior && item.sourceId === 'syllabus-2024' && prior.sourceId === item.sourceId &&
    /^正文段落 \d+(?: · 片段 \d+)?$/.test(prior.locator) && /^正文段落 \d+(?: · 片段 \d+)?$/.test(item.locator) &&
    Number(item.locator.match(/\d+/)?.[0]) <= Number(prior.locator.match(/\d+/)?.[0]) + 1;
  if (!continuousParagraphs || group.reduce((n, d) => n + d.text.length, 0) + item.text.length > 700) flush();
  group.push(item);
}
flush();

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'documents.json'), `${JSON.stringify(docs)}\n`, 'utf8');
await writeFile(join(outDir, 'sources.json'), `${JSON.stringify(sources.map(({ id, kind, retained_path }) => ({ id, kind, file: retained_path })))}\n`, 'utf8');
console.log(`Prepared ${docs.length} privacy-filtered reference chunks; PDF line endings were normalized as whitespace for retrieval. Consult source PDFs for exact layout and wording.`);
