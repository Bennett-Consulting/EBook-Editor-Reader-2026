/**
 * Task 3b — usePagination pure helper tests.
 *
 * The hook itself (usePagination) requires a React render environment and
 * cannot be tested with testEnvironment: 'node'. Its state-management logic
 * is thin wiring around paginate() and clampPageIndex(), both already covered
 * in paginationEngine.test.ts. The pure helpers exported alongside the hook
 * are tested here.
 */

import {
  PAGINATION_THRESHOLD,
  splitPageText,
  computePageParaOffset,
} from "../../src/hooks/usePagination";

// ─── PAGINATION_THRESHOLD ────────────────────────────────────────────────────

describe("PAGINATION_THRESHOLD", () => {
  it("is 50,000 characters", () => {
    expect(PAGINATION_THRESHOLD).toBe(50_000);
  });

  it("is exported as a number", () => {
    expect(typeof PAGINATION_THRESHOLD).toBe("number");
  });
});

// ─── splitPageText ────────────────────────────────────────────────────────────

describe("splitPageText", () => {
  it("splits on double newlines", () => {
    const result = splitPageText("Para one.\n\nPara two.\n\nPara three.");
    expect(result).toEqual(["Para one.", "Para two.", "Para three."]);
  });

  it("trims whitespace from each paragraph", () => {
    const result = splitPageText("  Leading space.  \n\n  Also trimmed.  ");
    expect(result).toEqual(["Leading space.", "Also trimmed."]);
  });

  it("filters out blank paragraphs", () => {
    const result = splitPageText("Para one.\n\n\n\n\n\nPara two.");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Para one.");
    expect(result[1]).toBe("Para two.");
  });

  it("returns empty array for empty input", () => {
    expect(splitPageText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    expect(splitPageText("   \n\n   ")).toEqual([]);
  });

  it("returns single paragraph for text with no double newlines", () => {
    const result = splitPageText("Just one paragraph here.");
    expect(result).toEqual(["Just one paragraph here."]);
  });

  it("handles mixed newline spacing", () => {
    const result = splitPageText("A.\n\n B. \n\nC.");
    expect(result).toHaveLength(3);
  });
});

// ─── computePageParaOffset ────────────────────────────────────────────────────

describe("computePageParaOffset", () => {
  it("returns 0 for page 0 (no preceding pages)", () => {
    const pages = ["Para one.\n\nPara two.", "Para three.\n\nPara four."];
    expect(computePageParaOffset(pages, 0)).toBe(0);
  });

  it("returns the paragraph count of page 0 when on page 1", () => {
    const pages = ["Para one.\n\nPara two.", "Para three.\n\nPara four."];
    expect(computePageParaOffset(pages, 1)).toBe(2);
  });

  it("accumulates correctly across multiple pages", () => {
    const pages = [
      "A.\n\nB.\n\nC.",   // 3 paragraphs
      "D.\n\nE.",         // 2 paragraphs
      "F.\n\nG.\n\nH.",   // 3 paragraphs
    ];
    expect(computePageParaOffset(pages, 0)).toBe(0);
    expect(computePageParaOffset(pages, 1)).toBe(3);
    expect(computePageParaOffset(pages, 2)).toBe(5);
  });

  it("handles empty pages gracefully (empty page contributes 0 paragraphs)", () => {
    const pages = ["A.\n\nB.", "", "C.\n\nD."];
    expect(computePageParaOffset(pages, 2)).toBe(2); // page 0 has 2, page 1 has 0
  });

  it("returns 0 for an empty pages array", () => {
    expect(computePageParaOffset([], 0)).toBe(0);
  });

  it("globalIdx = offset + local index maps to the correct paragraph", () => {
    const allParagraphs = ["A", "B", "C", "D", "E", "F"];
    const pages = ["A\n\nB\n\nC", "D\n\nE\n\nF"];
    const page1Paras = ["D", "E", "F"];
    const offset = computePageParaOffset(pages, 1); // 3

    page1Paras.forEach((para, localIdx) => {
      const globalIdx = offset + localIdx;
      expect(allParagraphs[globalIdx]).toBe(para);
    });
  });
});
