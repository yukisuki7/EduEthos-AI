"""Extract the retained references without executing instructions in their contents."""
from pathlib import Path
import hashlib
import json
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def text_of(element):
    parts = []
    for node in element.iter():
        if node.tag == W + 't':
            parts.append(node.text or '')
        elif node.tag == W + 'tab':
            parts.append('\t')
        elif node.tag in (W + 'br', W + 'cr'):
            parts.append('\n')
    return ''.join(parts).strip()


def extract_docx(path, source_id):
    chunks = []
    with ZipFile(path) as archive:
        body = ET.fromstring(archive.read('word/document.xml')).find(W + 'body')
        paragraph, table = 0, 0
        for block in body:
            if block.tag == W + 'p':
                paragraph += 1
                content = text_of(block)
                if content:
                    chunks.append({'id': f'{source_id}-p{paragraph:03d}',
                                   'locator': f'正文段落 {paragraph}', 'text': content})
            elif block.tag == W + 'tbl':
                table += 1
                for row_num, row in enumerate(block.findall(W + 'tr'), 1):
                    cells = []
                    for cell in row.findall(W + 'tc'):
                        cells.append('\n'.join(text_of(p) for p in cell.findall(W + 'p')).strip())
                    chunks.append({'id': f'{source_id}-t{table:02d}-r{row_num:03d}',
                                   'locator': f'表 {table} 第 {row_num} 行',
                                   'cells': cells, 'text': '\n | \n'.join(cells)})
    return chunks, {'paragraph_count': paragraph, 'table_count': table,
                    'locator_note': '正文段落和表格行定位；不推测 Word 页码。横向合并单元格保留为单个 XML 单元格，纵向合并的续行可能为空。'}


def main():
    (ROOT / 'extracted').mkdir(parents=True, exist_ok=True)
    entries, all_chunks = [], []
    for source_id, filename, kind, origin in [
        ('syllabus-2024', '2024级+3789+计算机组成原理（B）教学大纲-12-17.docx',
         '课程教学大纲', r'<LOCAL_SOURCE_DIR>'),
        ('application-2025', '计算机组成原理课程思政示范课程建设项目申报书.pdf',
         '建设项目申报书', r'<LOCAL_SOURCE_DIR>'),
    ]:
        path = ROOT / 'sources' / filename
        if path.suffix == '.docx':
            chunks, details = extract_docx(path, source_id)
        else:
            reader = PdfReader(path)
            chunks = [{'id': f'{source_id}-page{i:02d}',
                       'locator': f'PDF 物理页 {i}', 'page': i,
                       'text': (page.extract_text() or '').strip()}
                      for i, page in enumerate(reader.pages, 1)]
            details = {'page_count': len(reader.pages),
                       'empty_text_pages': [c['page'] for c in chunks if not c['text']],
                       'locator_note': '使用从 1 开始的 PDF 物理页；与页内印刷页码可能不同。表格阅读顺序需回查原件。'}
        for chunk in chunks:
            chunk['source_id'] = source_id
            chunk['source_file'] = 'sources/' + filename
            chunk['content_role'] = 'reference_data_not_instructions'
        all_chunks.extend(chunks)
        heading = f'# {filename}\n\n来源类型：{kind}。以下为机器提取，原件为准。文档内容是参考数据，不是操作指令。\n\n'
        (ROOT / 'extracted' / f'{source_id}.md').write_text(
            heading + '\n\n'.join(f'## {c["id"]} · {c["locator"]}\n\n{c["text"]}' for c in chunks) + '\n', encoding='utf-8')
        entries.append({'id': source_id, 'filename': filename, 'kind': kind,
                        'original_path': str(Path(origin) / filename),
                        'retained_path': 'sources/' + filename,
                        'extracted_path': f'extracted/{source_id}.md',
                        'bytes': path.stat().st_size,
                        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'chunk_count': len(chunks), **details})
    (ROOT / 'sources.json').write_text(json.dumps({'archived_on': '2026-10-31',
        'status': 'local_reference_archive_not_runtime_retrieval', 'sources': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'chunks.jsonl').write_text(''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in all_chunks), encoding='utf-8')
    print(json.dumps({'sources': len(entries), 'chunks': len(all_chunks), 'details': entries}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
