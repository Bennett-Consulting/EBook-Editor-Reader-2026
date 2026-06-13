/**
 * Types for the AI context module.
 * No imports from app code — this file must work in any JS/TS environment.
 */

export interface ContextRequest {
  /** The chapter or selection the AI should work on. Always included. */
  currentText: string;
  /** Full text of the chapter before the current one (tail is taken). */
  precedingText?: string;
  /** Full text of the chapter after the current one (head is taken). */
  followingText?: string;
  /** Pre-computed whole-book summary (produced by the analysis module). */
  bookSummary?: string;
  /** Pre-computed style profile (produced by extractStyleProfile). */
  styleProfile?: StyleProfile;
  /** What the AI should do — e.g. "Continue this passage in the same style." */
  taskInstruction: string;
  /** Characters to take from preceding/following text (default 1000). */
  tailLength?: number;
  /** Maximum tokens for the assembled prompt (default 4000). */
  tokenBudget?: number;
}

export interface ContextResult {
  /** Fully assembled prompt string, ready to send to any AI provider. */
  prompt: string;
  /** Rough token estimate of the assembled prompt. */
  tokenEstimate: number;
  /** Which sections made it into the prompt (false = dropped to meet budget). */
  sections: {
    styleProfile: boolean;
    bookSummary: boolean;
    precedingTail: boolean;
    currentText: boolean;    // always true
    followingHead: boolean;
    taskInstruction: boolean; // always true
  };
}

export interface StyleProfile {
  dominantTense: "past" | "present" | "unknown";
  pointOfView: "first" | "second" | "third" | "unknown";
  /** Average words per sentence in the sample. */
  avgSentenceLength: number;
  /** Top recurring proper nouns (up to 10). */
  recurringNouns: string[];
  /** First 500 chars of the sample used for extraction. */
  rawSample: string;
}
