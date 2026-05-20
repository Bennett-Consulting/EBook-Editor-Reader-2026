import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { Alert, Platform } from "react-native";
import JSZip from "jszip";
import { Book } from "./types";

export type ExportFormat = "md" | "txt" | "epub" | "docx" | "pdf";

function safeFilename(name: string) {
  return (name || "book").replace(/[^\w\-]+/g, "_").slice(0, 60) || "book";
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildPlainText(book: Book, format: "md" | "txt"): string {
  const header = format === "md"
    ? `# ${book.title}\n\n_by ${book.author}_\n\n---\n\n`
    : `${book.title}\nby ${book.author}\n\n${"=".repeat(40)}\n\n`;
  let body = book.content || "";
  if (book.annotations.length > 0) {
    const notes = book.annotations
      .filter((a) => a.note && a.note.trim())
      .map((a, i) => `${i + 1}. "${a.text.slice(0, 120).trim()}"\n   — ${a.note}`)
      .join("\n\n");
    if (notes) {
      body += format === "md"
        ? `\n\n---\n\n## Notes\n\n${notes}\n`
        : `\n\n${"=".repeat(40)}\nNotes\n\n${notes}\n`;
    }
  }
  return header + body;
}

interface Block { kind: "h"|"p"|"quote"|"ul"|"ol"; level?: number; text?: string; items?: string[]; }

function parseBlocks(content: string): Block[] {
  const out: Block[] = [];
  const blocks = (content || "").split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  for (const b of blocks) {
    const h = b.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push({ kind: "h", level: h[1].length, text: h[2] }); continue; }
    // Also detect "Chapter N" lines as h1
    if (/^chapter\s+\d+/i.test(b)) { out.push({ kind: "h", level: 1, text: b }); continue; }
    if (/^>\s/.test(b)) { out.push({ kind: "quote", text: b.replace(/^>\s?/gm, "") }); continue; }
    if (/^[-*]\s/.test(b)) {
      const items = b.split(/\n/).filter(l=>/^[-*]\s/.test(l)).map(l=>l.replace(/^[-*]\s+/, ""));
      out.push({ kind: "ul", items }); continue;
    }
    if (/^\d+\.\s/.test(b)) {
      const items = b.split(/\n/).filter(l=>/^\d+\.\s/.test(l)).map(l=>l.replace(/^\d+\.\s+/, ""));
      out.push({ kind: "ol", items }); continue;
    }
    out.push({ kind: "p", text: b });
  }
  return out;
}

function blocksToHtmlBody(blocks: Block[]): string {
  return blocks.map((b, i) => {
    // Insert page break before chapter headings (except the first)
    const pageBreak = (b.kind === "h" && (b.level || 1) <= 2 && i > 0)
      ? `<div style="page-break-before: always;"></div>\n`
      : "";
    if (b.kind === "h") return `${pageBreak}<h${b.level}>${escapeXml(b.text || "")}</h${b.level}>`;
    if (b.kind === "quote") return `<blockquote><p>${escapeXml(b.text || "").replace(/\n/g, "<br/>")}</p></blockquote>`;
    if (b.kind === "ul") return `<ul>${(b.items||[]).map(i=>`<li>${escapeXml(i)}</li>`).join("")}</ul>`;
    if (b.kind === "ol") return `<ol>${(b.items||[]).map(i=>`<li>${escapeXml(i)}</li>`).join("")}</ol>`;
    let safe = escapeXml(b.text || "");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/_([^_]+)_/g, "<em>$1</em>");
    return `<p>${safe.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}

// ── Table of Contents from blocks ──────────────────────────────────────────

function buildTocHtml(blocks: Block[]): string {
  const headings = blocks.filter(b => b.kind === "h" && (b.level || 1) <= 2);
  if (headings.length === 0) return "";
  const items = headings.map((h, i) => {
    const indent = (h.level || 1) === 2 ? 'style="margin-left: 1.5em;"' : "";
    return `<li ${indent}><a href="#chapter-${i}" style="color: #c89a3a; text-decoration: none;">${escapeXml(h.text || "")}</a></li>`;
  }).join("\n");
  return `<div class="toc">\n<h2 style="text-align: center; color: #666; font-size: 14pt; letter-spacing: 3px;">CONTENTS</h2>\n<ol style="list-style: none; padding: 0;">${items}</ol>\n</div>\n<div style="page-break-after: always;"></div>\n`;
}

function blocksToHtmlBodyWithAnchors(blocks: Block[]): string {
  let chapterIdx = 0;
  return blocks.map((b, i) => {
    const pageBreak = (b.kind === "h" && (b.level || 1) <= 2 && i > 0)
      ? `<div style="page-break-before: always;"></div>\n`
      : "";
    if (b.kind === "h") {
      const anchor = (b.level || 1) <= 2 ? `id="chapter-${chapterIdx++}"` : "";
      return `${pageBreak}<h${b.level} ${anchor}>${escapeXml(b.text || "")}</h${b.level}>`;
    }
    if (b.kind === "quote") return `<blockquote><p>${escapeXml(b.text || "").replace(/\n/g, "<br/>")}</p></blockquote>`;
    if (b.kind === "ul") return `<ul>${(b.items||[]).map(i=>`<li>${escapeXml(i)}</li>`).join("")}</ul>`;
    if (b.kind === "ol") return `<ol>${(b.items||[]).map(i=>`<li>${escapeXml(i)}</li>`).join("")}</ol>`;
    let safe = escapeXml(b.text || "");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/_([^_]+)_/g, "<em>$1</em>");
    return `<p>${safe.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");
}

// ── Word count helper ──────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function readingTime(words: number): string {
  const mins = Math.round(words / 238);
  if (mins < 60) return `${mins} min read`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m read`;
}

function buildPrintableHtml(book: Book): string {
  const blocks = parseBlocks(book.content || "");
  const words = wordCount(book.content || "");
  const toc = buildTocHtml(blocks);
  let notes = "";
  if (book.annotations.length > 0) {
    const items = book.annotations.map(a =>
      `<li><blockquote>${escapeXml(a.text.slice(0, 200))}</blockquote>${a.note ? `<p><em>— ${escapeXml(a.note)}</em></p>` : ""}</li>`).join("");
    notes = `<div style="page-break-before: always;"></div><hr/><h2>Notes &amp; Highlights</h2><ol>${items}</ol>`;
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>${escapeXml(book.title || "Untitled")}</title>
<style>
  @page { size: A5; margin: 22mm; }
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 2em; }
  h1 { font-size: 28pt; margin: 0 0 0.2em; letter-spacing: -0.5px; }
  h2 { font-size: 18pt; margin-top: 1.4em; }
  h3 { font-size: 14pt; }
  .title-page { text-align: center; padding: 3em 0; page-break-after: always; }
  .title-page h1 { font-size: 36pt; margin-bottom: 0.3em; }
  .author { color: #666; font-style: italic; margin-bottom: 0.5em; font-size: 14pt; }
  .meta { color: #999; font-size: 11pt; margin-top: 2em; }
  p { margin: 0 0 1em; text-align: justify; }
  blockquote { border-left: 3px solid #c89a3a; padding-left: 1em; color: #444; margin: 1em 0; }
  ul, ol { padding-left: 1.4em; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2em 0; }
  .toc { padding: 2em 0; }
  .toc ol li { padding: 6px 0; border-bottom: 1px dotted #ddd; font-size: 13pt; }
  .toc ol li a:hover { color: #FFB000; }
  @media print {
    body { max-width: none; padding: 0; }
  }
</style></head><body>
<div class="title-page">
  <h1>${escapeXml(book.title || "Untitled")}</h1>
  <p class="author">by ${escapeXml(book.author || "Anonymous")}</p>
  <p class="meta">${words.toLocaleString()} words · ${readingTime(words)}</p>
  <p class="meta">Exported from VoxScript</p>
</div>
${toc}
${blocksToHtmlBodyWithAnchors(blocks)}
${notes}
</body></html>`;
}

// --------------------------- EPUB --------------------------------
async function buildEpub(book: Book, asBlob: boolean): Promise<Blob | string> {
  const zip = new JSZip();
  const id = `urn:uuid:${book.id}`;
  const blocks = parseBlocks(book.content || "");

  // Split content into chapters at h1/h2 headings
  const chapters: { title: string; html: string }[] = [];
  let currentTitle = book.title || "Untitled";
  let currentBlocks: Block[] = [];

  for (const b of blocks) {
    if (b.kind === "h" && (b.level || 1) <= 2 && currentBlocks.length > 0) {
      chapters.push({ title: currentTitle, html: blocksToHtmlBody(currentBlocks) });
      currentTitle = b.text || "Chapter";
      currentBlocks = [b];
    } else {
      currentBlocks.push(b);
    }
  }
  if (currentBlocks.length > 0) {
    chapters.push({ title: currentTitle, html: blocksToHtmlBody(currentBlocks) });
  }
  if (chapters.length === 0) {
    chapters.push({ title: book.title || "Untitled", html: "<p></p>" });
  }

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")!.file("container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const manifestItems = chapters.map((_, i) =>
    `<item id="chap${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join("\n    ");
  const spineItems = chapters.map((_, i) =>
    `<itemref idref="chap${i}"/>`
  ).join("\n    ");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(id)}</dc:identifier>
    <dc:title>${escapeXml(book.title || "Untitled")}</dc:title>
    <dc:creator>${escapeXml(book.author || "Anonymous")}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split(".")[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifestItems}
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;

  const navItems = chapters.map((ch, i) =>
    `<li><a href="chapter${i}.xhtml">${escapeXml(ch.title)}</a></li>`
  ).join("\n");

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(book.title || "Untitled")}</title></head>
<body><nav epub:type="toc"><h1>Contents</h1>
<ol>${navItems}</ol></nav></body></html>`;

  const css = `body{font-family:Georgia,serif;line-height:1.7;padding:1em;color:#222}
h1{font-size:2em;margin:0 0 .2em}
h2{font-size:1.5em;margin-top:1.2em}
.author{color:#666;font-style:italic;margin-bottom:2em}
blockquote{border-left:3px solid #c89a3a;padding-left:1em;color:#444;margin:1em 0}
ul,ol{padding-left:1.4em}
p{margin:0 0 1em;text-align:justify}`;

  const oebps = zip.folder("OEBPS")!;
  oebps.file("content.opf", opf);
  oebps.file("nav.xhtml", nav);
  oebps.file("style.css", css);

  chapters.forEach((ch, i) => {
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(ch.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${ch.html}
</body></html>`;
    oebps.file(`chapter${i}.xhtml`, xhtml);
  });

  // Add notes as final chapter if present
  if (book.annotations.length > 0) {
    const items = book.annotations.map(a =>
      `<li><blockquote>${escapeXml(a.text.slice(0, 200))}</blockquote>${a.note ? `<p><em>— ${escapeXml(a.note)}</em></p>` : ""}</li>`).join("");
    const notesXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Notes &amp; Highlights</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>Notes &amp; Highlights</h1>
<ol>${items}</ol>
</body></html>`;
    oebps.file(`notes.xhtml`, notesXhtml);
  }

  if (asBlob) return await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  return await zip.generateAsync({ type: "base64" });
}

// --------------------------- DOCX --------------------------------
function docxParagraph(text: string, opts: { style?: string; bold?: boolean; italic?: boolean; pageBreak?: boolean } = {}) {
  const styleXml = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : "";
  const pageBreakXml = opts.pageBreak ? `<w:pageBreakBefore/>` : "";
  const rPr = (opts.bold || opts.italic) ? `<w:rPr>${opts.bold?"<w:b/>":""}${opts.italic?"<w:i/>":""}</w:rPr>` : "";
  return `<w:p><w:pPr>${styleXml}${pageBreakXml}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function blocksToDocxBody(blocks: Block[]): string {
  const out: string[] = [];
  let isFirst = true;
  for (const b of blocks) {
    if (b.kind === "h") {
      const needsBreak = !isFirst && (b.level || 1) <= 2;
      out.push(docxParagraph(b.text || "", {
        style: `Heading${Math.min(b.level||1, 3)}`,
        pageBreak: needsBreak,
      }));
      isFirst = false;
    }
    else if (b.kind === "quote") out.push(docxParagraph(b.text || "", { style: "Quote", italic: true }));
    else if (b.kind === "ul" || b.kind === "ol") (b.items||[]).forEach(item => out.push(docxParagraph(`• ${item}`)));
    else {
      out.push(docxParagraph(b.text || ""));
      isFirst = false;
    }
  }
  return out.join("");
}

async function buildDocx(book: Book, asBlob: boolean): Promise<Blob | string> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);
  zip.folder("_rels")!.file(".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const word = zip.folder("word")!;
  word.folder("_rels")!.file("document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`);

  // Enhanced styles with better typography
  word.file("styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="480" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
</w:styles>`);

  // Footer with page numbers
  word.file("footer1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`);

  const blocks = parseBlocks(book.content || "");
  const titlePara = docxParagraph(book.title || "Untitled", { style: "Heading1" });
  const authorPara = docxParagraph(`by ${book.author || "Anonymous"}`, { style: "Subtitle", italic: true });
  const bodyParas = blocksToDocxBody(blocks);
  let notesParas = "";
  if (book.annotations.length > 0) {
    notesParas += docxParagraph("Notes & Highlights", { style: "Heading2", pageBreak: true });
    book.annotations.forEach((a, i) => {
      notesParas += docxParagraph(`${i+1}. "${a.text.slice(0, 200)}"`, { style: "Quote", italic: true });
      if (a.note) notesParas += docxParagraph(`— ${a.note}`);
    });
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${titlePara}${authorPara}${bodyParas}${notesParas}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  word.file("document.xml", documentXml);

  if (asBlob) {
    return await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }
  return await zip.generateAsync({ type: "base64" });
}

// --------------------------- WEB helpers --------------------------------
function downloadBlobWeb(blob: Blob, filename: string) {
  // @ts-ignore
  const url = window.URL.createObjectURL(blob);
  // @ts-ignore
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  // @ts-ignore
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  // @ts-ignore
  setTimeout(() => window.URL.revokeObjectURL(url), 1500);
}

function printPdfWeb(book: Book) {
  const html = buildPrintableHtml(book);
  // @ts-ignore
  const w = window.open("", "_blank");
  if (!w) {
    // @ts-ignore
    const frame = window.document.createElement("iframe");
    frame.style.position = "fixed"; frame.style.right="0"; frame.style.bottom="0";
    frame.style.width="0"; frame.style.height="0"; frame.style.border="0";
    // @ts-ignore
    window.document.body.appendChild(frame);
    const fdoc = frame.contentDocument || frame.contentWindow?.document;
    if (!fdoc) throw new Error("Could not create print frame (popup blocker may be active)");
    fdoc.open(); fdoc.write(html); fdoc.close();
    setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 350);
    setTimeout(() => frame.remove(), 5000);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400);
}

// --------------------------- Main export ----------------------------------
export async function exportBook(
  book: Book,
  format: ExportFormat,
  onProgress?: (stage: string) => void
) {
  const filename = `${safeFilename(book.title)}.${format}`;
  onProgress?.("Preparing export…");

  // ---------- WEB ----------
  if (Platform.OS === "web") {
    try {
      if (format === "pdf") {
        onProgress?.("Generating PDF…");
        printPdfWeb(book);
        return;
      }
      let blob: Blob;
      if (format === "epub") {
        onProgress?.("Building EPUB…");
        blob = await buildEpub(book, true) as Blob;
      }
      else if (format === "docx") {
        onProgress?.("Building Word document…");
        blob = await buildDocx(book, true) as Blob;
      }
      else {
        onProgress?.("Writing text…");
        const text = buildPlainText(book, format);
        blob = new Blob([text], { type: format === "md" ? "text/markdown" : "text/plain" });
      }
      downloadBlobWeb(blob, filename);
    } catch (e: any) {
      if (typeof window !== "undefined") window.alert(`Export failed: ${e?.message ?? "Unknown error"}`);
    }
    return;
  }

  // ---------- NATIVE (Android / iOS) ----------
  try {
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!dir) throw new Error("No writable directory available");
    let uri = `${dir}${filename}`;
    let mime = "text/plain";

    if (format === "epub") {
      onProgress?.("Building EPUB…");
      const base64 = await buildEpub(book, false) as string;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      mime = "application/epub+zip";
    } else if (format === "docx") {
      onProgress?.("Building Word document…");
      const base64 = await buildDocx(book, false) as string;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (format === "pdf") {
      onProgress?.("Generating PDF…");
      const html = buildPrintableHtml(book);
      const result = await Print.printToFileAsync({ html, base64: false });
      uri = result.uri;
      mime = "application/pdf";
    } else {
      onProgress?.("Writing text…");
      const text = buildPlainText(book, format);
      await FileSystem.writeAsStringAsync(uri, text);
      mime = format === "md" ? "text/markdown" : "text/plain";
    }

    onProgress?.("Opening share sheet…");
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Alert.alert("Saved", `File written to: ${uri}`);
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: mime,
      dialogTitle: `Export "${book.title}"`,
    });
  } catch (e: any) {
    Alert.alert("Export failed", e?.message ?? "Unknown error");
  }
}
