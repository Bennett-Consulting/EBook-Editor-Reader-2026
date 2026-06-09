/**
 * EPUB Parser — extracts structured chapters from .epub files.
 *
 * EPUB files are ZIP archives containing XHTML chapters.
 * Uses JSZip (already installed) to unzip and parse.
 */
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";
import { Platform } from "react-native";

export interface EpubChapter {
  title: string;
  content: string;
}

export interface ParsedEpub {
  title: string;
  author: string;
  chapters: EpubChapter[];
  content: string; // all chapters joined — backward compat with Book.content
}

/**
 * Parse an EPUB file and extract structured chapters.
 * @param uri - file URI (from DocumentPicker or FileSystem)
 */
export async function parseEpub(uri: string): Promise<ParsedEpub> {
  let zipData: string | ArrayBuffer;

  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    zipData = await resp.arrayBuffer();
  } else {
    zipData = await (FileSystem as any).readAsStringAsync(uri, {
      encoding: "base64",
    });
  }

  return parseEpubData(zipData, Platform.OS === "web" ? "arraybuffer" : "base64");
}

/**
 * Parse EPUB from raw data — exposed for testing without file I/O.
 */
export async function parseEpubData(
  data: string | ArrayBuffer,
  encoding: "base64" | "arraybuffer"
): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(data, { base64: encoding === "base64" });

  // 1. Find content.opf via container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing META-INF/container.xml");

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error("Invalid EPUB: no rootfile path in container.xml");
  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error(`Invalid EPUB: missing OPF at ${opfPath}`);

  // 2. Extract metadata
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/);
  const title = decodeEntities(titleMatch?.[1] || "Untitled");
  const author = decodeEntities(authorMatch?.[1] || "Unknown");

  // 3. Build manifest map: id → href (XHTML items only)
  const manifestItems: Record<string, string> = {};
  const manifestRe = /<item\s+([^>]*?)\/?\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = manifestRe.exec(opfXml))) {
    const attrs = m[1];
    const idM = attrs.match(/id="([^"]+)"/);
    const hrefM = attrs.match(/href="([^"]+)"/);
    const typeM = attrs.match(/media-type="([^"]+)"/);
    if (idM && hrefM && typeM && typeM[1].includes("xhtml")) {
      manifestItems[idM[1]] = hrefM[1];
    }
  }

  // 4. Get spine reading order
  const spineRe = /<itemref\s+idref="([^"]+)"[^>]*\/?>/g;
  const spineIds: string[] = [];
  while ((m = spineRe.exec(opfXml))) spineIds.push(m[1]);

  // 5. Read each spine item, extract title + text
  const chapters: EpubChapter[] = [];
  let chapterNumber = 0;

  for (const id of spineIds) {
    const href = manifestItems[id];
    if (!href) continue;
    const fullPath = opfDir + decodeURIComponent(href);
    const xhtml = await zip.file(fullPath)?.async("text");
    if (!xhtml) continue;

    const chapterTitle = extractHeading(xhtml) || `Chapter ${++chapterNumber}`;
    const content = stripHtml(xhtml);
    if (content.length > 0) {
      chapters.push({ title: chapterTitle, content });
    }
  }

  if (chapters.length === 0) {
    throw new Error("Could not extract any text from this EPUB");
  }

  return {
    title,
    author,
    chapters,
    content: chapters.map((c) => `${c.title}\n\n${c.content}`).join("\n\n"),
  };
}

/** Extract the first heading from an XHTML string. */
function extractHeading(html: string): string | null {
  const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!m) return null;
  const text = stripHtml(m[1]).trim();
  return text.length > 0 ? text : null;
}

/** Strip HTML tags and decode common entities to get clean plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
