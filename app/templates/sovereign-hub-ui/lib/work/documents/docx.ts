import type { Block, DocumentModel, Inline } from "./markdown"
import { buildZip, xmlEscape } from "./zip"

/**
 * DOCX writer: a real Office Open XML package (WordprocessingML), opened by
 * Word, LibreOffice, Google Docs and Pages. Headings use Word's built-in
 * heading styles (so the navigation pane and a table of contents work),
 * lists use real numbering, tables are real tables, links are real
 * hyperlinks. Monochrome, Arial.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

type Context = { links: string[]; numbering: Array<{ ordered: boolean; start: number }> }

function run(inline: Inline, context: Context, extra = ""): string {
  const properties = [
    inline.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : "",
    inline.bold ? "<w:b/><w:bCs/>" : "",
    inline.italic ? "<w:i/><w:iCs/>" : "",
    inline.link ? '<w:rStyle w:val="Hyperlink"/>' : "",
    extra,
  ].join("")
  // Line breaks inside a run become <w:br/>.
  const pieces = inline.text.split("\n").map((piece) => `<w:t xml:space="preserve">${xmlEscape(piece)}</w:t>`).join("<w:br/>")
  const body = `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${pieces}</w:r>`
  if (!inline.link || !/^(?:https?:|mailto:)/i.test(inline.link)) return body
  context.links.push(inline.link)
  return `<w:hyperlink r:id="rIdLink${context.links.length}" w:history="1">${body}</w:hyperlink>`
}

function runs(inlines: Inline[], context: Context, extra = "") {
  return inlines.map((inline) => run(inline, context, extra)).join("")
}

function paragraph(content: string, properties = "") {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${content}</w:p>`
}

function block(item: Block, context: Context): string {
  if (item.type === "heading") return paragraph(runs(item.inlines, context), `<w:pStyle w:val="Heading${Math.min(item.level, 4)}"/>`)
  if (item.type === "paragraph") return paragraph(runs(item.inlines, context))
  if (item.type === "quote") return paragraph(runs(item.inlines, context), '<w:pStyle w:val="Quote"/>')
  if (item.type === "rule") return paragraph("", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>')
  if (item.type === "code") {
    const lines = item.text.split("\n").map((line) => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join("<w:br/>")
    return paragraph(`<w:r>${lines}</w:r>`, '<w:pStyle w:val="Code"/>')
  }
  if (item.type === "list") {
    context.numbering.push({ ordered: item.ordered, start: item.start })
    const numId = context.numbering.length
    return item.items.map((entry) => paragraph(runs(entry.inlines, context), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${entry.level}"/><w:numId w:val="${numId}"/></w:numPr>`)).join("")
  }
  // Table: header row repeated on every page, light grey header, thin borders.
  const columns = Math.max(item.header.length, ...item.rows.map((row) => row.length), 1)
  const width = Math.floor(9_000 / columns)
  const cell = (inlines: Inline[], header: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}</w:tcPr>${paragraph(runs(inlines, context, header ? "<w:b/><w:bCs/>" : ""), '<w:spacing w:before="40" w:after="40"/>')}</w:tc>`
  const row = (cells: Inline[][], header: boolean) => {
    const filled = [...cells]
    while (filled.length < columns) filled.push([])
    return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${filled.map((inlines) => cell(inlines, header)).join("")}</w:tr>`
  }
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${row(item.header, true)}${item.rows.map((cells) => row(cells, false)).join("")}</w:tbl>${paragraph("")}`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="7F7F7F"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="160" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="000000"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
</w:styles>`

function numberingXml(lists: Array<{ ordered: boolean; start: number }>) {
  const level = (ordered: boolean, index: number) => {
    const indent = 360 + index * 360
    if (ordered) {
      const format = ["decimal", "lowerLetter", "lowerRoman", "decimal"][index]
      return `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="${format}"/><w:lvlText w:val="%${index + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent + 360}" w:hanging="360"/></w:pPr></w:lvl>`
    }
    const bullet = ["•", "◦", "▪", "•"][index]
    return `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bullet}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent + 360}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl>`
  }
  const abstract = [false, true].map((ordered, id) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3].map((index) => level(ordered, index)).join("")}</w:abstractNum>`).join("")
  // One instance per list, so each numbered list starts from its own number.
  const nums = lists.map((list, index) => `<w:num w:numId="${index + 1}"><w:abstractNumId w:val="${list.ordered ? 1 : 0}"/>${list.ordered ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${Math.max(1, list.start)}"/></w:lvlOverride>` : ""}</w:num>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>${abstract}${nums}</w:numbering>`
}

export function buildDocx(model: DocumentModel, options: { createdAt?: Date; author?: string } = {}): Uint8Array {
  const context: Context = { links: [], numbering: [] }
  const blocks = model.blocks
  const startsWithTitle = blocks[0]?.type === "heading" && blocks[0].level === 1
  const body = [
    startsWithTitle ? "" : paragraph(run({ text: model.title }, context), '<w:pStyle w:val="Title"/>'),
    ...blocks.map((item, index) => (index === 0 && startsWithTitle && item.type === "heading" ? paragraph(runs(item.inlines, context), '<w:pStyle w:val="Title"/>') : block(item, context))),
  ].join("")
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body || paragraph("")}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`
  const relationships = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
    ...context.links.map((url, index) => `<Relationship Id="rIdLink${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`),
  ].join("")
  const created = (options.createdAt || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z")
  const files = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(model.title)}</dc:title><dc:creator>${xmlEscape(options.author || "Malik AI")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Malik AI</Application></Properties>' },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: STYLES },
    { name: "word/numbering.xml", data: numberingXml(context.numbering) },
    { name: "word/settings.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: "word/footer1.xml", data: footer },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>` },
  ]
  return buildZip(files)
}
