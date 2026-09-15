#!/usr/bin/env python3
import csv, html, json, os, sys, textwrap, zipfile
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape


def safe_text(v):
    return str(v or '').replace('\x00','').strip()

def write_docx(path, title, lines):
    paras=[title,'']+lines
    body=''.join(f'<w:p><w:r><w:t xml:space="preserve">{xml_escape(safe_text(x))}</w:t></w:r></w:p>' for x in paras)
    doc=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'''
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>''')
        z.writestr('_rels/.rels','''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>''')
        z.writestr('word/document.xml',doc)

def write_xlsx(path, rows):
    def cell(c,r,v): return f'<c r="{c}{r}" t="inlineStr"><is><t>{xml_escape(safe_text(v))}</t></is></c>'
    xml_rows=[]
    for ri,row in enumerate(rows,1):
        cells=''.join(cell(chr(65+ci),ri,v) for ci,v in enumerate(row[:20]))
        xml_rows.append(f'<row r="{ri}">{cells}</row>')
    sheet=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{''.join(xml_rows)}</sheetData></worksheet>'''
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>''')
        z.writestr('_rels/.rels','''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>''')
        z.writestr('xl/workbook.xml','''<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>''')
        z.writestr('xl/_rels/workbook.xml.rels','''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>''')
        z.writestr('xl/worksheets/sheet1.xml',sheet)

def pdf_escape(s): return safe_text(s).encode('latin-1','replace').decode('latin-1').replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
def write_pdf(path,title,lines):
    wrapped=[]
    for line in [title,'']+lines:
        wrapped.extend(textwrap.wrap(safe_text(line),88) or [''])
    pages=[wrapped[i:i+45] for i in range(0,len(wrapped),45)] or [[]]
    objs=[None,None,None]
    page_ids=[]; content_ids=[]
    next_id=4
    for _ in pages:
        page_ids.append(next_id); content_ids.append(next_id+1); next_id+=2
    font_id=next_id
    kids=' '.join(f'{x} 0 R' for x in page_ids)
    objs[0]='<< /Type /Catalog /Pages 2 0 R >>'; objs[1]=f'<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>'; objs[2]=''
    while len(objs)<font_id: objs.append('')
    for idx,lineset in enumerate(pages):
        stream=['BT','/F1 12 Tf','50 790 Td','16 TL']
        for line in lineset: stream.append(f'({pdf_escape(line)}) Tj T*')
        stream.append('ET'); data='\n'.join(stream)
        objs[page_ids[idx]-1]=f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_ids[idx]} 0 R >>'
        objs[content_ids[idx]-1]=f'<< /Length {len(data.encode("latin-1"))} >>\nstream\n{data}\nendstream'
    objs[font_id-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    out=bytearray(b'%PDF-1.4\n'); offsets=[0]
    for i,obj in enumerate(objs,1):
        offsets.append(len(out)); out.extend(f'{i} 0 obj\n{obj}\nendobj\n'.encode('latin-1'))
    xref=len(out); out.extend(f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode())
    for off in offsets[1:]: out.extend(f'{off:010d} 00000 n \n'.encode())
    out.extend(f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    Path(path).write_bytes(out)

def product(spec,out):
    title=safe_text(spec.get('title')); outline=[safe_text(x) for x in spec.get('outline',[])]; audience=safe_text(spec.get('audience')); brand=spec.get('brand') or {}
    lines=[]
    if audience: lines.append(f'Audience: {audience}')
    if brand.get('name'): lines.append(f'Brand: {safe_text(brand.get("name"))}')
    lines += [f'{i+1}. {x}' for i,x in enumerate(outline)]
    typ=spec.get('type')
    if typ in ('spreadsheet','tracker'):
        rows=[['Section','Status','Notes']]+[[x,'Not started',''] for x in outline]
        with open(out/'product.csv','w',newline='',encoding='utf-8') as f: csv.writer(f).writerows(rows)
        write_xlsx(out/'product.xlsx',rows); return {'csv':str(out/'product.csv'),'xlsx':str(out/'product.xlsx')}
    write_docx(out/'product.docx',title,lines); write_pdf(out/'product.pdf',title,lines); return {'docx':str(out/'product.docx'),'pdf':str(out/'product.pdf')}

def website(spec,out):
    name=html.escape(safe_text(spec.get('name'))); goal=html.escape(safe_text(spec.get('goal'))); brand=spec.get('brand') or {}; palette=html.escape(safe_text(brand.get('palette') or 'neutral'))
    css=':root{font-family:Inter,system-ui,sans-serif;color:#171717;background:#fff}*{box-sizing:border-box}body{margin:0}main{max-width:1080px;margin:auto;padding:64px 24px}.hero{padding:72px 0}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.card{border:1px solid #ddd;border-radius:16px;padding:20px}.cta{margin-top:48px;padding:28px;border-radius:16px;background:#f5f5f5}@media(max-width:600px){main{padding:32px 18px}.hero{padding:40px 0}}'
    features=''.join(f'<article class="card"><h2>{html.escape(safe_text(x))}</h2></article>' for x in ['Clear value proposition','Creator-led content','Responsive experience'])
    page=f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name}</title><link rel="stylesheet" href="styles.css"><main><section class="hero"><p>{palette} brand direction</p><h1>{name}</h1><p>{goal or "Discover "+name}</p></section><section class="features">{features}</section><section class="cta"><h2>Ready to start?</h2></section></main></html>'
    (out/'index.html').write_text(page,encoding='utf-8');(out/'styles.css').write_text(css,encoding='utf-8')
    with zipfile.ZipFile(out/'website.zip','w',zipfile.ZIP_DEFLATED) as z:z.write(out/'index.html','index.html');z.write(out/'styles.css','styles.css')
    return {'html':str(out/'index.html'),'css':str(out/'styles.css'),'zip':str(out/'website.zip')}

def main():
    if len(sys.argv)!=4: raise SystemExit('usage: export_artifacts.py product|website spec.json outdir')
    mode,spec_path,out_dir=sys.argv[1:];out=Path(out_dir);out.mkdir(parents=True,exist_ok=True);spec=json.loads(Path(spec_path).read_text(encoding='utf-8'))
    result=product(spec,out) if mode=='product' else website(spec,out) if mode=='website' else None
    if result is None: raise SystemExit('unsupported mode')
    print(json.dumps(result))
if __name__=='__main__': main()
