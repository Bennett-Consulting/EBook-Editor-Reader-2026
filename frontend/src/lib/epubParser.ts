/**
 * EPUB Parser — extracts text content from .epub files.
 *
 * EPUB files are ZIP archives containing XHTML chapters.
 * Uses JSZip (already installed) to unzip and parse.
 */
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";
import { Platform } from "react-native";

export interface ParsedEpub {
  title: string;
  author: string;
  content: string;
}

/**
 * Parse an EPUB file and extract its text content.
 * @param uri - file URI (from DocumentPicker or FileSystem)
 * @returns Parsed book metadata and content
 */
export async function parseEpub(uri: string): Promise<ParsedEpub> {
  let zipData: string | ArrayBuffer;

  if (Platform.OS === "web") {
    // On web, fetch as ArrayBuffer
    const resp = await fetch(uri);
    zipData = await resp.arrayBuffer();
  } else {
    // On native, read as base64
    zipData = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const zip = await JSZip.loadAsync(zipData, {
    base64: Platform.OS !== "web",
  });

  // 1. Find content.opf via container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error("Invalid EPUB: no rootfile path");
  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) throw new Error("Invalid EPUB: missing content.opf");

  // 2. Extract metadata
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/);
  const title = decodeEntities(titleMatch?.[1] || "Untitled");
  const author = decodeEntities(authorMatch?.[1] || "Unknown");

  // 3. Build manifest map (id → href) for XHTML items
  const manifestItems: Record<string, string> = {};
  const manifestRe =
    /<item\s+([^>]*?)\/?\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = manifestRe.exec(opfXml))) {
    const attrs = m[1];
    const idMatch = attrs.match(/id="([^"]+)"/);
    const hrefMatch = attrs.match(/href="([^"]+)"/);
    const typeMatch = attrs.match(/media-type="([^"]+)"/);
    if (
      idMatch &&
      hrefMatch &&
      typeMatch &&
      typeMatch[1].includes("xhtml")
    ) {
      manifestItems[idMatch[1]] = hrefMatch[1];
    }
  }

  // 4. Get spine reading order
  const spineRe = /<itemref\s+idref="([^"]+)"[^>]*\/?>/g;
  const spineIds: string[] = [];
  while ((m = spineRe.exec(opfXml))) spineIds.push(m[1]);

  // 5. Read and extract text from each chapter in spine order
  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifestItems[id];
    if (!href) continue;
    const fullPath = opfDir + decodeURIComponent(href);
    const xhtml = await zip.file(fullPath)?.async("text");
    if (!xhtml) continue;

    const text = stripHtml(xhtml);
    if (text.length > 0) chapters.push(text);
  }

  if (chapters.length === 0) {
    throw new Error("Could not extract any text from this EPUB");
  }

  return { title, author, content: chapters.join("\n\n") };
}

/** Strip HTML tags and decode common entities to get clean text. */
function stripHtml(html: string): string {
  return html
    // Remove style and script blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Convert block elements to line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decode XML/HTML entities in metadata strings. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
