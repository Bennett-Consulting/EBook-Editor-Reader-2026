/**
 * epubParser tests — builds real in-memory EPUBs via JSZip and verifies
 * that parseEpubData returns structured chapters with titles and content.
 *
 * Uses parseEpubData() directly to bypass file I/O (no FileSystem mock needed).
 */
import JSZip from "jszip";
import { parseEpubData } from "../../src/lib/epubParser";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeChapterXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
  <h2>${title}</h2>
  <p>${body}</p>
</body>
</html>`;
}

interface ChapterDef {
  id: string;
  title: string;
  body: string;
}

async function buildEpub(
  bookTitle: string,
  bookAuthor: string,
  chapters: ChapterDef[]
): Promise<string> {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip");

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const manifestItems = chapters
    .map(
      (c) =>
        `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join("\n    ");

  const spineItems = chapters
    .map((c) => `<itemref idref="${c.id}"/>`)
    .join("\n    ");

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${bookTitle}</dc:title>
    <dc:creator>${bookAuthor}</dc:creator>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
  );

  for (const c of chapters) {
    zip.file(`OEBPS/${c.id}.xhtml`, makeChapterXhtml(c.title, c.body));
  }

  return zip.generateAsync({ type: "base64" });
}

// ─── fixtures ───────────────────────────────────────────────────────────────

const PRIDE_CHAPTERS: ChapterDef[] = [
  { id: "ch01", title: "Chapter I",   body: "It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife." },
  { id: "ch02", title: "Chapter II",  body: "Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice." },
  { id: "ch03", title: "Chapter III", body: "Not all that Mrs. Bennet had been able to do could prevent her daughters from being introduced at the ball." },
  { id: "ch04", title: "Chapter IV",  body: "When Jane and Elizabeth were alone, the former, who had been cautious in her praise of Mr. Bingley before, expressed to her sister just how very much she admired him." },
  { id: "ch05", title: "Chapter V",   body: "Within a short walk of Longbourn lived a family with whom the Bennets were particularly intimate." },
  { id: "ch06", title: "Chapter VI",  body: "The ladies of Longbourn soon waited on those of Netherfield." },
  { id: "ch07", title: "Chapter VII", body: "Mr. Bennet's property consisted almost entirely in an entail, which gave him no power of keeping it from his five daughters in favour of his wife." },
];

// ─── tests ──────────────────────────────────────────────────────────────────

describe("parseEpubData", () => {
  let base64Epub: string;

  beforeAll(async () => {
    base64Epub = await buildEpub("Pride and Prejudice", "Jane Austen", PRIDE_CHAPTERS);
  });

  it("returns correct book title and author", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    expect(result.title).toBe("Pride and Prejudice");
    expect(result.author).toBe("Jane Austen");
  });

  it("returns at least 5 chapters", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    expect(result.chapters.length).toBeGreaterThanOrEqual(5);
  });

  it("all chapters have non-empty content", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    for (const chapter of result.chapters) {
      expect(chapter.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("extracts chapter titles from headings", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    expect(result.chapters[0].title).toBe("Chapter I");
    expect(result.chapters[1].title).toBe("Chapter II");
    expect(result.chapters[4].title).toBe("Chapter V");
  });

  it("chapter content does not contain HTML tags", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    for (const chapter of result.chapters) {
      expect(chapter.content).not.toMatch(/<[^>]+>/);
    }
  });

  it("flat content field joins all chapters", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    const totalChapterLength = result.chapters.reduce(
      (sum, c) => sum + c.content.length,
      0
    );
    expect(result.content.length).toBeGreaterThanOrEqual(totalChapterLength);
  });

  it("returns all 7 chapters when all are non-empty", async () => {
    const result = await parseEpubData(base64Epub, "base64");
    expect(result.chapters.length).toBe(7);
  });

  it("throws on invalid EPUB (no container.xml)", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    const bad = await zip.generateAsync({ type: "base64" });
    await expect(parseEpubData(bad, "base64")).rejects.toThrow(
      "missing META-INF/container.xml"
    );
  });

  it("falls back to Chapter N when heading is missing", async () => {
    const noHeadingChapters: ChapterDef[] = [
      { id: "c1", title: "", body: "First chapter body text without a heading." },
      { id: "c2", title: "", body: "Second chapter body text without a heading." },
      { id: "c3", title: "", body: "Third chapter body text without a heading." },
      { id: "c4", title: "", body: "Fourth chapter body text without a heading." },
      { id: "c5", title: "", body: "Fifth chapter body text without a heading." },
    ];
    // Build chapters without <h2> tags
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    const manifest = noHeadingChapters.map(c => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join("");
    const spine = noHeadingChapters.map(c => `<itemref idref="${c.id}"/>`).join("");
    zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>No Headings Book</dc:title><dc:creator>Author</dc:creator></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    for (const c of noHeadingChapters) {
      zip.file(`OEBPS/${c.id}.xhtml`, `<html><body><p>${c.body}</p></body></html>`);
    }
    const b64 = await zip.generateAsync({ type: "base64" });
    const result = await parseEpubData(b64, "base64");
    expect(result.chapters[0].title).toBe("Chapter 1");
    expect(result.chapters[4].title).toBe("Chapter 5");
  });
});
