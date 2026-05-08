import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { Alert } from "react-native";
import JSZip from "jszip";
import { Book } from "./types";

export type ExportFormat = "md" | "txt" | "epub" | "docx" | "pdf";

function safeFilename(name: string) {
  return (name || "book").replace(/[^\w\-]+/g, "_").slice(0, 60) || "book";
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPlainText(book: Book, format: "md" | "txt"): string {
  const header =
    format === "md"
      ? `# ${book.title}\n\n_by ${book.author}_\n\n---\n\n`
      : `${book.title}\nby ${book.author}\n\n${"=".repeat(40)}\n\n`;

  let body = book.content || "";
  if (book.annotations.length > 0) {
    const notes = book.annotations
      .filter((a) => a.note && a.note.trim())
      .map((a, i) => `${i + 1}. "${a.text.slice(0, 120).trim()}"\n   — ${a.note}`)
      .join("\n\n");
    if (notes) {
      body +=
        format === "md"
          ? `\n\n---\n\n## Notes\n\n${notes}\n`
          : `\n\n${"=".repeat(40)}\nNotes\n\n${notes}\n`;
    }
  }
  return header + body;
}

interface Block {
  kind: "h" | "p" | "quote" | "ul" | "ol";
  level?: number;
  text?: string;
  items?: string[];
}

function parseBlocks(content: string): Block[] {
  const out: Block[] = [];
  const blocks = (content || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const h = b.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ kind: "h", level: h[1].length, text: h[2] });
      continue;
    }
    if (/^>\s/.test(b)) {
      out.push({ kind: "quote", text: b.replace(/^>\s?/gm, "") });
      continue;
    }
    if (/^[-*]\s/.test(b)) {
      const items = b
        .split(/\n/)
        .filter((l) => /^[-*]\s/.test(l))
        .map((l) => l.replace(/^[-*]\s+/, ""));
      out.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s/.test(b)) {
      const items = b
        .split(/\n/)
        .filter((l) => /^\d+\.\s/.test(l))
        .map((l) => l.replace(/^\d+\.\s+/, ""));
      out.push({ kind: "ol", items });
      continue;
    }
    out.push({ kind: "p", text: b });
  }
  return out;
}

function blocksToHtmlBody(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "h") {
        return `<h${b.level}>${escapeXml(b.text || "")}</h${b.level}>`;
      }
      if (b.kind === "quote") {
        return `<blockquote><p>${escapeXml(b.text || "").replace(/\n/g, "<br/>")}</p></blockquote>`;
      }
      if (b.kind === "ul") {
        return `<ul>${(b.items || []).map((i) => `<li>${escapeXml(i)}</li>`).join("")}</ul>`;
      }
      if (b.kind === "ol") {
        return `<ol>${(b.items || []).map((i) => `<li>${escapeXml(i)}</li>`).join("")}</ol>`;
      }
      let safe = escapeXml(b.text || "");
      safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      safe = safe.replace(/_([^_]+)_/g, "<em>$1</em>");
      return `<p>${safe.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
}

// --------------------------- EPUB --------------------------------
async function buildEpubBase64(book: Book): Promise<string> {
  const zip = new JSZip();
  const id = `urn:uuid:${book.id}`;
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")!.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
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
    <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine><itemref idref="chap1"/></spine>
</package>`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(book.title || "Untitled")}</title></head>
<body><nav epub:type="toc"><h1>Contents</h1>
<ol><li><a href="chapter1.xhtml">${escapeXml(book.title || "Untitled")}</a></li></ol></nav></body></html>`;
  const blocks = parseBlocks(book.content || "");
  let notes = "";
  if (book.annotations.length > 0) {
    const items = book.annotations
      .map(
        (a) =>
          `<li><blockquote>${escapeXml(a.text.slice(0, 200))}</blockquote>${
            a.note ? `<p><em>— ${escapeXml(a.note)}</em></p>` : ""
          }</li>`
      )
      .join("");
    notes = `<hr/><h2>Notes &amp; Highlights</h2><ol>${items}</ol>`;
  }
  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(book.title || "Untitled")}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>${escapeXml(book.title || "Untitled")}</h1>
<p class="author">by ${escapeXml(book.author || "Anonymous")}</p>
${blocksToHtmlBody(blocks)}
${notes}
</body></html>`;
  const css = `body{font-family:Georgia,serif;line-height:1.7;padding:1em;color:#222}
h1{font-size:2em;margin:0 0 .2em}
.author{color:#666;font-style:italic;margin-bottom:2em}
blockquote{border-left:3px solid #c89a3a;padding-left:1em;color:#444;margin:1em 0}
ul,ol{padding-left:1.4em}`;
  const oebps = zip.folder("OEBPS")!;
  oebps.file("content.opf", opf);
  oebps.file("nav.xhtml", nav);
  oebps.file("chapter1.xhtml", chapter);
  oebps.file("style.css", css);
  return await zip.generateAsync({ type: "base64" });
}

// --------------------------- DOCX --------------------------------
function docxParagraph(
  text: string,
  opts: { style?: string; bold?: boolean; italic?: boolean } = {}
) {
  const styleXml = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : "";
  const rPr =
    opts.bold || opts.italic
      ? `<w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.italic ? "<w:i/>" : ""}</w:rPr>`
      : "";
  return `<w:p><w:pPr>${styleXml}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function blocksToDocxBody(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "h") {
      out.push(docxParagraph(b.text || "", { style: `Heading${Math.min(b.level || 1, 3)}` }));
    } else if (b.kind === "quote") {
      out.push(docxParagraph(b.text || "", { style: "Quote", italic: true }));
    } else if (b.kind === "ul" || b.kind === "ol") {
      for (const item of b.items || []) {
        out.push(docxParagraph(`• ${item}`));
      }
    } else {
      out.push(docxParagraph(b.text || ""));
    }
  }
  return out.join("");
}

async function buildDocxBase64(book: Book): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );
  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const word = zip.folder("word")!;
  word.folder("_rels")!.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  word.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
</w:styles>`
  );

  const blocks = parseBlocks(book.content || "");
  const titlePara = docxParagraph(book.title || "Untitled", { style: "Heading1" });
  const authorPara = docxParagraph(`by ${book.author || "Anonymous"}`, { italic: true });
  const bodyParas = blocksToDocxBody(blocks);
  let notesParas = "";
  if (book.annotations.length > 0) {
    notesParas += docxParagraph("Notes & Highlights", { style: "Heading2" });
    book.annotations.forEach((a, i) => {
      notesParas += docxParagraph(`${i + 1}. "${a.text.slice(0, 200)}"`, { style: "Quote", italic: true });
      if (a.note) notesParas += docxParagraph(`— ${a.note}`);
    });
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${titlePara}
    ${authorPara}
    ${bodyParas}
    ${notesParas}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  word.file("document.xml", documentXml);
  return await zip.generateAsync({ type: "base64" });
}

// --------------------------- PDF (native via expo-print) --------------------------------
function buildPrintableHtml(book: Book): string {
  const blocks = parseBlocks(book.content || "");
  let notes = "";
  if (book.annotations.length > 0) {
    const items = book.annotations
      .map(
        (a) =>
          `<li><blockquote>${escapeXml(a.text.slice(0, 200))}</blockquote>${
            a.note ? `<p><em>— ${escapeXml(a.note)}</em></p>` : ""
          }</li>`
      )
      .join("");
    notes = `<hr/><h2>Notes &amp; Highlights</h2><ol>${items}</ol>`;
  }
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>${escapeXml(book.title || "Untitled")}</title>
<style>
  @page { size: A5; margin: 22mm; }
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.7; color: #1a1a1a; }
  h1 { font-size: 28pt; margin: 0 0 0.2em; letter-spacing: -0.5px; }
  h2 { font-size: 18pt; margin-top: 1.4em; }
  h3 { font-size: 14pt; }
  .author { color: #666; font-style: italic; margin-bottom: 2em; }
  p { margin: 0 0 1em; text-align: justify; }
  blockquote { border-left: 3px solid #c89a3a; padding-left: 1em; color: #444; margin: 1em 0; }
  ul, ol { padding-left: 1.4em; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 2em 0; }
</style></head><body>
<h1>${escapeXml(book.title || "Untitled")}</h1>
<p class="author">by ${escapeXml(book.author || "Anonymous")}</p>
${blocksToHtmlBody(blocks)}
${notes}
</body></html>`;
}

// --------------------------- Main export ----------------------------------
export async function exportBook(book: Book, format: ExportFormat) {
  const filename = `${safeFilename(book.title)}.${format}`;
  try {
    const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!dir) throw new Error("No writable directory available");
    let uri = `${dir}${filename}`;
    let mime = "text/plain";

    if (format === "epub") {
      const base64 = await buildEpubBase64(book);
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      mime = "application/epub+zip";
    } else if (format === "docx") {
      const base64 = await buildDocxBase64(book);
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      mime =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (format === "pdf") {
      const html = buildPrintableHtml(book);
      const result = await Print.printToFileAsync({ html, base64: false });
      uri = result.uri;
      mime = "application/pdf";
    } else {
      const text = buildPlainText(book, format);
      await FileSystem.writeAsStringAsync(uri, text);
      mime = format === "md" ? "text/markdown" : "text/plain";
    }

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
