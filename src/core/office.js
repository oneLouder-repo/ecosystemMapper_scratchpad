/**
 * Word (.docx), OpenDocument (.odt) and Excel (.xlsx) files from plain
 * data, for the browser and the server alike. Small and dependency-free:
 * each format is a zip of XML files (core/zip.js).
 *
 *   await docx(blocks, dc)      → Uint8Array   blocks from core/markdown.js
 *   await odt(blocks, dc)       → Uint8Array
 *   await xlsx(sheets, dc)      → Uint8Array   sheets: [{ name, rows: [[cell]] }]
 *
 * `dc` is a Dublin Core record (platform/library.js dublinCore), written
 * into each file's own metadata (docProps/core.xml, meta.xml), which Word,
 * LibreOffice and file managers show as the document's properties.
 *
 * A block may carry `style: 'reference'` (hanging indent, for APA lists)
 * or `style: 'title'` / `'subtitle'`.
 */
import { zipBytes } from './zip.js';

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* ---------- Word ---------- */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function coreXml(dc = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${x(dc.title)}</dc:title>
<dc:creator>${x(list(dc.creator).join('; '))}</dc:creator>
<dc:subject>${x(dc.source || '')}</dc:subject>
<dc:description>${x(dc.description)}</dc:description>
<dc:language>${x(dc.language || 'en')}</dc:language>
<dc:identifier>${x(list(dc.identifier)[0] ?? '')}</dc:identifier>
<cp:keywords>${x(list(dc.subject).join(', '))}</cp:keywords>
<cp:category>${x(dc.type || '')}</cp:category>
<dcterms:created xsi:type="dcterms:W3CDTF">${isoNow()}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow()}</dcterms:modified>
</cp:coreProperties>`;
}

const WORD_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-CA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="320"/></w:pPr><w:rPr><w:color w:val="595959"/><w:sz w:val="24"/></w:rPr></w:style>
${[1, 2, 3, 4, 5, 6].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 30, 26, 24, 22, 22][n - 1]}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BFBFBF"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="720"/><w:spacing w:line="480" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const WORD_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0">${[0, 1, 2, 3].map((l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪', '•'][l]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1">${[0, 1, 2, 3].map((l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman', 'decimal'][l]}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

/** A Word document from blocks. */
export async function docx(blocks, dc = {}) {
  const links = [];
  const run = (r) => {
    if (r.t === '\n') return '<w:r><w:br/></w:r>';
    // Word wants these in schema order: style, font, bold, italic, strike.
    const pr = [r.href && '<w:rStyle w:val="Hyperlink"/>', r.code && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', r.b && '<w:b/>', r.i && '<w:i/>', r.s && '<w:strike/>'].filter(Boolean).join('');
    const body = `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.t)}</w:t></w:r>`;
    if (!r.href || !/^(https?:|mailto:)/i.test(r.href)) return body;
    links.push(r.href);
    return `<w:hyperlink r:id="rIdL${links.length}">${body}</w:hyperlink>`;
  };
  const runs = (rs) => rs.map(run).join('');
  const p = (style, content, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${content}</w:p>`;
  const body = blocks.map((b) => {
    switch (b.type) {
      case 'heading': return p(`Heading${b.level}`, runs(b.runs));
      case 'para': return p({ reference: 'Bibliography', title: 'Title', subtitle: 'Subtitle' }[b.style] ?? '', runs(b.runs));
      case 'quote': return p('Quote', runs(b.runs));
      case 'code': return b.text.split('\n').map((line) => p('Code', `<w:r><w:t xml:space="preserve">${x(line)}</w:t></w:r>`)).join('');
      case 'rule': return p('', '', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>');
      case 'item': return p('ListParagraph', `${b.checked != null ? `<w:r><w:t xml:space="preserve">${b.checked ? '☑' : '☐'} </w:t></w:r>` : ''}${runs(b.runs)}`, `<w:numPr><w:ilvl w:val="${Math.min(b.level, 3)}"/><w:numId w:val="${b.ordered ? 2 : 1}"/></w:numPr>`);
      case 'table': {
        const cols = Math.max(...b.rows.map((r) => r.length));
        const width = Math.floor(9360 / cols);
        return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + width + '"/>'.repeat(cols)}</w:tblGrid>${b.rows.map((r, i) => `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: cols }, (_, c) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${p('', runs((r[c] ?? []).map((run) => (i === 0 ? { ...run, b: true } : run))), '<w:spacing w:after="0"/>')}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${p('', '')}`;
      }
      default: return '';
    }
  }).join('\n');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${links.map((l, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${x(l)}" TargetMode="External"/>`).join('\n')}
</Relationships>`;
  return zipBytes([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>` },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: WORD_STYLES },
    { name: 'word/numbering.xml', data: WORD_NUMBERING },
    { name: 'word/_rels/document.xml.rels', data: rels },
    { name: 'docProps/core.xml', data: coreXml(dc) },
    { name: 'docProps/app.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Dashi</Application></Properties>' },
  ]);
}

/* ---------- OpenDocument text ---------- */

const ODF_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"';

function odfMeta(dc = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${ODF_NS}><office:meta>
<meta:generator>Dashi</meta:generator>
<dc:title>${x(dc.title)}</dc:title>
<dc:description>${x(dc.description)}</dc:description>
<dc:subject>${x(dc.source || '')}</dc:subject>
<dc:language>${x(dc.language || 'en')}</dc:language>
${list(dc.creator).slice(0, 1).map((c) => `<meta:initial-creator>${x(c)}</meta:initial-creator><dc:creator>${x(c)}</dc:creator>`).join('')}
<dc:date>${isoNow()}</dc:date>
${list(dc.subject).map((k) => `<meta:keyword>${x(k)}</meta:keyword>`).join('')}
${Object.entries({ 'DC.publisher': dc.publisher, 'DC.date': dc.date, 'DC.type': dc.type, 'DC.identifier': list(dc.identifier).join(' '), 'DC.rights': dc.rights, 'DC.creator': list(dc.creator).join('; '), 'DC.contributor': list(dc.contributor).join('; ') }).filter(([, v]) => v).map(([k, v]) => `<meta:user-defined meta:name="${k}">${x(v)}</meta:user-defined>`).join('')}
</office:meta></office:document-meta>`;
}

/** An OpenDocument text file from blocks. */
export async function odt(blocks, dc = {}) {
  const spanStyles = new Map();
  const spanStyle = (r) => {
    const key = `${r.b ? 'b' : ''}${r.i ? 'i' : ''}${r.s ? 's' : ''}${r.code ? 'c' : ''}`;
    if (!key) return null;
    if (!spanStyles.has(key)) spanStyles.set(key, `T_${key}`);
    return spanStyles.get(key);
  };
  const run = (r) => {
    if (r.t === '\n') return '<text:line-break/>';
    const st = spanStyle(r);
    let s = x(r.t).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
    if (st) s = `<text:span text:style-name="${st}">${s}</text:span>`;
    if (r.href && /^(https?:|mailto:)/i.test(r.href)) s = `<text:a xlink:type="simple" xlink:href="${x(r.href)}">${s}</text:a>`;
    return s;
  };
  const runs = (rs) => rs.map(run).join('');
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'item') {
      // A run of list items becomes nested text:list elements.
      const items = [];
      // Bullets and numbers at the top level are separate lists.
      while (blocks[i]?.type === 'item' && (!items.length || blocks[i].level > 0 || blocks[i].ordered === items[0].ordered)) items.push(blocks[i++]);
      i--;
      const build = (from, level) => {
        const style = items[from].ordered ? 'L_num' : 'L_bul';
        let s = `<text:list${level === 0 ? ` text:style-name="${style}"` : ''}>`;
        let j = from;
        while (j < items.length && items[j].level >= level) {
          const it = items[j];
          s += `<text:list-item><text:p text:style-name="P_List">${it.checked != null ? (it.checked ? '☑ ' : '☐ ') : ''}${runs(it.runs)}</text:p>`;
          j++;
          if (j < items.length && items[j].level > level) { const [inner, next] = build(j, level + 1); s += inner; j = next; }
          s += '</text:list-item>';
        }
        return [`${s}</text:list>`, j];
      };
      let j = 0;
      while (j < items.length) { const [s, next] = build(j, items[j].level); out.push(s); j = next; }
      continue;
    }
    switch (b.type) {
      case 'heading': out.push(`<text:h text:style-name="Heading_20_${b.level}" text:outline-level="${b.level}">${runs(b.runs)}</text:h>`); break;
      case 'para': out.push(`<text:p text:style-name="${{ reference: 'P_Ref', title: 'Title', subtitle: 'Subtitle' }[b.style] ?? 'Text_20_body'}">${runs(b.runs)}</text:p>`); break;
      case 'quote': out.push(`<text:p text:style-name="Quotations">${runs(b.runs)}</text:p>`); break;
      case 'code': out.push(...b.text.split('\n').map((l) => `<text:p text:style-name="Preformatted_20_Text">${run({ t: l || ' ' })}</text:p>`)); break;
      case 'rule': out.push('<text:p text:style-name="Horizontal_20_Line"/>'); break;
      case 'table': {
        const cols = Math.max(...b.rows.map((r) => r.length));
        out.push(`<table:table table:name="Table${i + 1}" table:style-name="Tbl"><table:table-column table:number-columns-repeated="${cols}"/>${b.rows.map((r, ri) => `<table:table-row>${Array.from({ length: cols }, (_, c) => `<table:table-cell table:style-name="Cell" office:value-type="string"><text:p text:style-name="${ri === 0 ? 'P_TH' : 'Table_20_Contents'}">${runs(r[c] ?? [])}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table>`);
        break;
      }
      default:
    }
  }
  const auto = [...spanStyles].map(([key, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties${key.includes('b') ? ' fo:font-weight="bold"' : ''}${key.includes('i') ? ' fo:font-style="italic"' : ''}${key.includes('s') ? ' style:text-line-through-style="solid"' : ''}${key.includes('c') ? ' style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\'"' : ''}/></style:style>`).join('');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ODF_NS}>
<office:automatic-styles>${auto}
<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="16.5cm" table:align="margins"/></style:style>
<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #bfbfbf"/></style:style>
<style:style style:name="P_TH" style:family="paragraph" style:parent-style-name="Table_20_Contents"><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:text>${out.join('\n')}</office:text></office:body></office:document-content>`;
  const heading = (n, size) => `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="${n}" style:class="text"><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold"/></style:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${ODF_NS}>
<office:font-face-decls xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"/>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.25cm"/><style:text-properties fo:font-size="11pt" style:font-name="Liberation Sans" fo:font-family="'Liberation Sans', Arial, sans-serif" fo:language="en" fo:country="CA"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-bottom="0.25cm" fo:line-height="130%"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>
${heading(1, 18)}${heading(2, 15)}${heading(3, 13)}${heading(4, 12)}${heading(5, 11)}${heading(6, 11)}
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading" style:class="chapter"><style:text-properties fo:font-size="24pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Standard" style:class="chapter"><style:paragraph-properties fo:margin-bottom="0.6cm"/><style:text-properties fo:font-size="12pt" fo:color="#595959"/></style:style>
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm" fo:border-left="1.5pt solid #bfbfbf" fo:padding-left="0.3cm"/><style:text-properties fo:font-style="italic" fo:color="#404040"/></style:style>
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-bottom="0cm" fo:background-color="#f2f2f2"/><style:text-properties style:font-name="Liberation Mono" fo:font-family="'Liberation Mono', monospace" fo:font-size="9.5pt"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-bottom="0.3cm" fo:border-bottom="0.5pt solid #bfbfbf" fo:padding="0cm"/></style:style>
<style:style style:name="P_List" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>
<style:style style:name="P_Ref" style:display-name="Bibliography" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-left="1.27cm" fo:text-indent="-1.27cm" fo:line-height="200%"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0cm"/></style:style>
<text:list-style style:name="L_bul">${[1, 2, 3, 4].map((l) => `<text:list-level-style-bullet text:level="${l}" text:bullet-char="${['•', '◦', '▪', '•'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(l * 0.635 + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('')}</text:list-style>
<text:list-style style:name="L_num">${[1, 2, 3, 4].map((l) => `<text:list-level-style-number text:level="${l}" style:num-suffix="." style:num-format="${['1', 'a', 'i', '1'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(l * 0.635 + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>`).join('')}</text:list-style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21.59cm" fo:page-height="27.94cm" fo:margin-top="2.54cm" fo:margin-bottom="2.54cm" fo:margin-left="2.54cm" fo:margin-right="2.54cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`;
  return zipBytes([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', plain: true },
    { name: 'META-INF/manifest.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>` },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
    { name: 'meta.xml', data: odfMeta(dc) },
  ]);
}

/* ---------- Excel ---------- */

const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** An Excel workbook: sheets [{ name, rows: [[string | number | null]] }]. The first row is bold. */
export async function xlsx(sheets, dc = {}) {
  const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${(rows[0] ?? []).map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 28 : 14}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    const s = ri === 0 ? ' s="1"' : '';
    if (v == null || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    if (typeof v === 'string' && v.startsWith('=')) return `<c r="${ref}"${s}><f>${x(v.slice(1))}</f></c>`;
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const safe = (n, i) => (String(n || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return zipBytes([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(safe(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
    { name: 'docProps/core.xml', data: coreXml(dc) },
  ]);
}
