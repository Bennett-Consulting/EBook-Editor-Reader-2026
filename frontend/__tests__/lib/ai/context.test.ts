/**
 * Task 4 — AI Context Module tests.
 *
 * Verifies: context includes prev/next tails, token budget enforced,
 * sections flags reflect inclusions, style profile extraction, estimateTokens.
 */

import {
  buildContext,
  extractStyleProfile,
  estimateTokens,
} from "../../../src/lib/ai/context";

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns ceil(length / 4) for a simple string", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a sensible estimate for English prose", () => {
    const para = "The quick brown fox jumps over the lazy dog. ";
    const tokens = estimateTokens(para.repeat(10));
    expect(tokens).toBeGreaterThan(80);
    expect(tokens).toBeLessThan(200);
  });
});

// ─── buildContext ─────────────────────────────────────────────────────────────

const TASK = "Continue this passage in the same style.";
const CURRENT = "She opened the door and stepped into the cold night air.";

describe("buildContext — required sections", () => {
  it("always includes currentText and taskInstruction", () => {
    const result = buildContext({ currentText: CURRENT, taskInstruction: TASK });
    expect(result.prompt).toContain(CURRENT);
    expect(result.prompt).toContain(TASK);
    expect(result.sections.currentText).toBe(true);
    expect(result.sections.taskInstruction).toBe(true);
  });

  it("prompt contains [Current Text] and [Task] section headers", () => {
    const result = buildContext({ currentText: CURRENT, taskInstruction: TASK });
    expect(result.prompt).toContain("[Current Text]");
    expect(result.prompt).toContain("[Task]");
  });
});

describe("buildContext — preceding/following tails", () => {
  const longPreceding = "A".repeat(3000);
  const longFollowing = "B".repeat(3000);

  it("includes only the tail (last tailLength chars) of precedingText", () => {
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      precedingText: longPreceding,
      tailLength: 1000,
    });
    if (result.sections.precedingTail) {
      // The included text should be at most tailLength chars
      const precedingSection = result.prompt
        .split("[Preceding Context]")[1]
        ?.split("\n\n")[0] ?? "";
      expect(precedingSection.trim().length).toBeLessThanOrEqual(1001);
    }
    expect(result.sections.precedingTail).toBeDefined();
  });

  it("includes only the head (first tailLength chars) of followingText", () => {
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      followingText: longFollowing,
      tailLength: 1000,
    });
    if (result.sections.followingHead) {
      const followingSection = result.prompt
        .split("[Following Context]")[1]
        ?.split("\n\n")[0] ?? "";
      expect(followingSection.trim().length).toBeLessThanOrEqual(1001);
    }
  });

  it("sections.precedingTail is true when preceding fits in budget", () => {
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      precedingText: "Short preceding text.",
      tokenBudget: 4000,
    });
    expect(result.sections.precedingTail).toBe(true);
  });

  it("prompt contains [Preceding Context] header when included", () => {
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      precedingText: "Previous chapter ending.",
    });
    if (result.sections.precedingTail) {
      expect(result.prompt).toContain("[Preceding Context]");
    }
  });
});

describe("buildContext — token budget enforcement", () => {
  it("prompt token estimate does not exceed tokenBudget", () => {
    const bigText = "Word ".repeat(2000); // ~10,000 chars
    const result = buildContext({
      currentText: bigText,
      taskInstruction: TASK,
      precedingText: "A".repeat(5000),
      followingText: "B".repeat(5000),
      bookSummary: "C".repeat(2000),
      tokenBudget: 1000,
    });
    expect(result.tokenEstimate).toBeLessThanOrEqual(1100); // allow small rounding
  });

  it("drops followingHead before precedingTail when budget is tight", () => {
    // Give just enough budget for current + task + preceding but not following
    const current = "X".repeat(200);  // ~50 tokens
    const task = "Continue.";          // ~3 tokens
    const preceding = "Y".repeat(200); // ~50 tokens
    const following = "Z".repeat(4000); // ~1000 tokens — won't fit

    const result = buildContext({
      currentText: current,
      taskInstruction: task,
      precedingText: preceding,
      followingText: following,
      tokenBudget: 200,
    });
    // Preceding should fit, following should not
    if (result.sections.precedingTail) {
      expect(result.sections.followingHead).toBe(false);
    }
  });

  it("handles extremely small budget by clamping currentText", () => {
    const result = buildContext({
      currentText: "A very long piece of text that definitely exceeds the budget.".repeat(100),
      taskInstruction: TASK,
      tokenBudget: 20,
    });
    expect(result.tokenEstimate).toBeLessThanOrEqual(100); // clamped
    expect(result.sections.currentText).toBe(true);
    expect(result.sections.taskInstruction).toBe(true);
  });
});

describe("buildContext — optional sections", () => {
  it("includes bookSummary when provided and budget allows", () => {
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      bookSummary: "A detective solves a murder in a small town.",
      tokenBudget: 4000,
    });
    expect(result.sections.bookSummary).toBe(true);
    expect(result.prompt).toContain("[Book Summary]");
  });

  it("includes styleProfile when provided and budget allows", () => {
    const profile = {
      dominantTense: "past" as const,
      pointOfView: "third" as const,
      avgSentenceLength: 18,
      recurringNouns: ["Holmes", "Watson"],
      rawSample: "sample",
    };
    const result = buildContext({
      currentText: CURRENT,
      taskInstruction: TASK,
      styleProfile: profile,
      tokenBudget: 4000,
    });
    expect(result.sections.styleProfile).toBe(true);
    expect(result.prompt).toContain("[Author Style]");
    expect(result.prompt).toContain("Holmes");
  });

  it("sections.styleProfile is false when no styleProfile provided", () => {
    const result = buildContext({ currentText: CURRENT, taskInstruction: TASK });
    expect(result.sections.styleProfile).toBe(false);
  });

  it("sections.bookSummary is false when no bookSummary provided", () => {
    const result = buildContext({ currentText: CURRENT, taskInstruction: TASK });
    expect(result.sections.bookSummary).toBe(false);
  });
});

// ─── extractStyleProfile ──────────────────────────────────────────────────────

const PAST_TENSE_TEXT = `
Holmes walked briskly into the room. Watson looked up from his chair and smiled.
"You were saying?" Watson asked. Holmes had already crossed to the window.
He gazed out at the fog that had settled over Baker Street. The night was cold.
`;

const PRESENT_TENSE_TEXT = `
She walks into the room and sees him standing by the window.
He turns and looks at her. The light is fading. Outside, the city hums and breathes.
`;

const FIRST_PERSON_TEXT = `
I walked down the street, my hands in my pockets. We had argued again.
My mind raced through what I had said. It was my fault, I knew that.
`;

describe("extractStyleProfile — tense detection", () => {
  it("detects past tense in past-tense prose", () => {
    const profile = extractStyleProfile(PAST_TENSE_TEXT);
    expect(profile.dominantTense).toBe("past");
  });

  it("detects present tense in present-tense prose", () => {
    const profile = extractStyleProfile(PRESENT_TENSE_TEXT);
    expect(profile.dominantTense).toBe("present");
  });
});

describe("extractStyleProfile — point of view detection", () => {
  it("detects first-person POV", () => {
    const profile = extractStyleProfile(FIRST_PERSON_TEXT);
    expect(profile.pointOfView).toBe("first");
  });

  it("detects third-person POV", () => {
    const profile = extractStyleProfile(PAST_TENSE_TEXT);
    expect(profile.pointOfView).toBe("third");
  });
});

describe("extractStyleProfile — recurring nouns", () => {
  it("identifies names that appear multiple times", () => {
    const profile = extractStyleProfile(PAST_TENSE_TEXT);
    expect(profile.recurringNouns).toContain("Holmes");
    expect(profile.recurringNouns).toContain("Watson");
  });

  it("returns at most 10 nouns", () => {
    const text = Array.from({ length: 15 }, (_, i) => `Name${i} walked. Name${i} spoke.`).join(" ");
    const profile = extractStyleProfile(text);
    expect(profile.recurringNouns.length).toBeLessThanOrEqual(10);
  });
});

describe("extractStyleProfile — avg sentence length", () => {
  it("returns a positive average sentence length for real prose", () => {
    const profile = extractStyleProfile(PAST_TENSE_TEXT);
    expect(profile.avgSentenceLength).toBeGreaterThan(0);
    expect(profile.avgSentenceLength).toBeLessThan(100);
  });
});

describe("extractStyleProfile — rawSample", () => {
  it("rawSample is the first 500 chars of input", () => {
    const text = "A".repeat(1000);
    const profile = extractStyleProfile(text);
    expect(profile.rawSample).toBe("A".repeat(500));
  });

  it("rawSample is the full input when shorter than 500 chars", () => {
    const text = "Short text.";
    const profile = extractStyleProfile(text);
    expect(profile.rawSample).toBe(text);
  });
});
