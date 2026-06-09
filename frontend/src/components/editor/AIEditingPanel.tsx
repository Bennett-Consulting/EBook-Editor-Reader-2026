/**
 * AIEditingPanel — Unified AI editing flow for the editor
 *
 * Modes: Spell Check, Grammar, Tone Analysis, Screenwriting
 * Slides up as a bottom sheet with mode tabs, results display,
 * and action buttons (apply fix, apply all, replace, etc.)
 */

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../lib/theme";
import {
  EditingMode,
  EditingResult,
  SpellIssue,
  GrammarIssue,
  ToneAnalysis,
  runEditingMode,
} from "../../lib/aiEditing";
import { streamAIResponse } from "../../lib/aiGateway";

// ─── Mode config ────────────────────────────────────────────────────────────

type PanelMode = EditingMode | "stream-continue";

const MODES: {
  key: PanelMode;
  label: string;
  icon: string;
  desc: string;
}[] = [
  {
    key: "stream-continue",
    label: "Continue",
    icon: "✍️",
    desc: "AI continues writing, streamed live",
  },
  {
    key: "spellcheck",
    label: "Spelling",
    icon: "🔤",
    desc: "Find and fix spelling errors",
  },
  {
    key: "grammar",
    label: "Grammar",
    icon: "📝",
    desc: "Check grammar and sentence structure",
  },
  {
    key: "tone",
    label: "Tone",
    icon: "🎨",
    desc: "Analyze writing tone and voice",
  },
  {
    key: "screenplay",
    label: "Screenplay",
    icon: "🎬",
    desc: "Convert to industry screenplay format",
  },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  content: string;
  /** Book ID used to look up cached summary and style profile for AI context. */
  bookId?: string;
  onApplyFix: (original: string, replacement: string) => void;
  onReplaceAll: (newContent: string) => void;
  onAppendBelow: (text: string) => void;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AIEditingPanel({
  visible,
  content,
  bookId = "",
  onApplyFix,
  onReplaceAll,
  onAppendBelow,
  onClose,
}: Props) {
  const [activeMode, setActiveMode] = useState<PanelMode>("stream-continue");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EditingResult | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<Set<number>>(new Set());
  // Streaming "Continue" mode state — tokens appended as they arrive
  const [streamText, setStreamText] = useState("");
  const streamDoneRef = useRef(false);

  const runMode = useCallback(
    async (mode: PanelMode) => {
      if (!content.trim()) {
        Alert.alert("Nothing to check", "Write some text first.");
        return;
      }
      setActiveMode(mode);
      setLoading(true);
      setResult(null);
      setAppliedFixes(new Set());

      // ── Streaming "Continue" mode ──────────────────────────────────────────
      if (mode === "stream-continue") {
        setStreamText("");
        streamDoneRef.current = false;
        try {
          await streamAIResponse(
            bookId,
            content,
            "Continue this passage in the same style, tone, and tense. Write 2-4 sentences that flow naturally from where the text ends. Return only the continuation, no preamble.",
            {
              onChunk: (chunk) => {
                setStreamText((prev) => prev + chunk);
              },
              onDone: (full) => {
                setStreamText(full);
                streamDoneRef.current = true;
                setLoading(false);
              },
              onError: (err) => {
                Alert.alert("Stream error", err.message);
              },
            },
          );
        } catch (e: any) {
          Alert.alert("Error", e?.message || "AI streaming failed");
          setLoading(false);
        }
        return;
      }

      // ── Existing editing modes ─────────────────────────────────────────────
      try {
        const res = await runEditingMode(mode as EditingMode, content);
        setResult(res);
      } catch (e: any) {
        Alert.alert("Error", e?.message || "AI editing failed");
      } finally {
        setLoading(false);
      }
    },
    [content, bookId]
  );

  const handleApplySpellFix = (index: number, issue: SpellIssue) => {
    onApplyFix(issue.word, issue.suggestion);
    setAppliedFixes((prev) => new Set(prev).add(index));
  };

  const handleApplyGrammarFix = (index: number, issue: GrammarIssue) => {
    onApplyFix(issue.original, issue.suggestion);
    setAppliedFixes((prev) => new Set(prev).add(index));
  };

  const handleApplyAllSpelling = () => {
    if (!result?.spellIssues) return;
    result.spellIssues.forEach((issue) => {
      onApplyFix(issue.word, issue.suggestion);
    });
    setAppliedFixes(
      new Set(result.spellIssues.map((_, i) => i))
    );
  };

  const handleApplyAllGrammar = () => {
    if (!result?.grammarIssues) return;
    result.grammarIssues.forEach((issue) => {
      onApplyFix(issue.original, issue.suggestion);
    });
    setAppliedFixes(
      new Set(result.grammarIssues.map((_, i) => i))
    );
  };

  const handleClose = () => {
    setResult(null);
    setAppliedFixes(new Set());
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="construct" size={18} color={theme.brand} />
            <Text style={styles.title}>AI Editing</Text>
            {result && (
              <Text style={styles.modelBadge}>
                {result.provider} · {result.model}
              </Text>
            )}
          </View>

          {/* Mode Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modesRow}
          >
            {MODES.map((m) => {
              const isActive = activeMode === m.key && result?.mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  testID={`edit-mode-${m.key}`}
                  onPress={() => runMode(m.key)}
                  disabled={loading}
                  style={[
                    styles.modeChip,
                    isActive && styles.modeChipActive,
                    loading && styles.modeChipDisabled,
                  ]}
                >
                  <Text style={styles.modeIcon}>{m.icon}</Text>
                  <View>
                    <Text
                      style={[
                        styles.modeLabel,
                        isActive && styles.modeLabelActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                    <Text style={styles.modeDesc}>{m.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Results Area */}
          <ScrollView style={styles.resultsBox}>
            {loading && activeMode === "stream-continue" ? (
              // Streaming mode: show tokens as they arrive while loading
              <View style={styles.streamWrap}>
                <View style={styles.streamHeader}>
                  <ActivityIndicator color={theme.brand} size="small" />
                  <Text style={styles.streamLabel}>Writing…</Text>
                </View>
                <Text testID="stream-output" style={styles.streamText}>
                  {streamText}
                </Text>
              </View>
            ) : !loading && activeMode === "stream-continue" && streamText ? (
              // Streaming complete — show result with append/replace actions
              <View style={styles.streamWrap}>
                <Text testID="stream-output" style={styles.streamText}>
                  {streamText}
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.brand} size="large" />
                <Text style={styles.loadingText}>
                  {activeMode === "spellcheck"
                    ? "Checking spelling…"
                    : activeMode === "grammar"
                    ? "Analyzing grammar…"
                    : activeMode === "tone"
                    ? "Reading your tone…"
                    : "Converting to screenplay…"}
                </Text>
              </View>
            ) : !result ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>✨</Text>
                <Text style={styles.emptyText}>
                  Pick a mode above to analyze your text.
                </Text>
              </View>
            ) : result.mode === "spellcheck" ? (
              <SpellResults
                issues={result.spellIssues || []}
                appliedFixes={appliedFixes}
                onApply={handleApplySpellFix}
              />
            ) : result.mode === "grammar" ? (
              <GrammarResults
                issues={result.grammarIssues || []}
                appliedFixes={appliedFixes}
                onApply={handleApplyGrammarFix}
              />
            ) : result.mode === "tone" ? (
              <ToneResults analysis={result.toneAnalysis!} />
            ) : result.mode === "screenplay" ? (
              <ScreenplayResults text={result.screenplayText || ""} />
            ) : null}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {activeMode === "stream-continue" && streamText && !loading && (
              <>
                <TouchableOpacity
                  testID="stream-append"
                  onPress={() => { onAppendBelow(streamText); handleClose(); }}
                  style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                >
                  <Text style={styles.btnPrimaryText}>Append below</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="stream-replace"
                  onPress={() => { onReplaceAll(streamText); handleClose(); }}
                  style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                >
                  <Text style={styles.btnGhostText}>Replace</Text>
                </TouchableOpacity>
              </>
            )}
            {result?.mode === "spellcheck" &&
              (result.spellIssues?.length ?? 0) > 0 && (
                <TouchableOpacity
                  testID="apply-all-spell"
                  onPress={handleApplyAllSpelling}
                  style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                >
                  <Ionicons name="checkmark-done" size={18} color="#0A0A0B" />
                  <Text style={styles.btnPrimaryText}> Fix all spelling</Text>
                </TouchableOpacity>
              )}
            {result?.mode === "grammar" &&
              (result.grammarIssues?.length ?? 0) > 0 && (
                <TouchableOpacity
                  testID="apply-all-grammar"
                  onPress={handleApplyAllGrammar}
                  style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                >
                  <Ionicons name="checkmark-done" size={18} color="#0A0A0B" />
                  <Text style={styles.btnPrimaryText}> Fix all grammar</Text>
                </TouchableOpacity>
              )}
            {result?.mode === "screenplay" && result.screenplayText && (
              <>
                <TouchableOpacity
                  testID="screenplay-replace"
                  onPress={() => {
                    onReplaceAll(result.screenplayText!);
                    handleClose();
                  }}
                  style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                >
                  <Text style={styles.btnPrimaryText}>Replace with screenplay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="screenplay-append"
                  onPress={() => {
                    onAppendBelow(result.screenplayText!);
                    handleClose();
                  }}
                  style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                >
                  <Text style={styles.btnGhostText}>Append below</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              onPress={handleClose}
              style={[
                styles.btn,
                styles.btnGhost,
                { flex: result ? 0 : 1 },
              ]}
            >
              <Text style={styles.btnGhostText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Spell Check Results ────────────────────────────────────────────────────

function SpellResults({
  issues,
  appliedFixes,
  onApply,
}: {
  issues: SpellIssue[];
  appliedFixes: Set<number>;
  onApply: (index: number, issue: SpellIssue) => void;
}) {
  if (issues.length === 0) {
    return (
      <View style={styles.successWrap}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>No spelling errors found</Text>
        <Text style={styles.successSub}>Your text looks clean!</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.issueCount}>
        {issues.length} spelling issue{issues.length !== 1 ? "s" : ""} found
      </Text>
      {issues.map((issue, i) => {
        const isFixed = appliedFixes.has(i);
        return (
          <View key={`${issue.word}-${i}`} style={styles.issueCard}>
            <View style={styles.issueRow}>
              <View style={styles.issueContent}>
                <View style={styles.wordRow}>
                  <Text style={styles.issueOriginal}>{issue.word}</Text>
                  <Ionicons name="arrow-forward" size={14} color={theme.textTertiary} />
                  <Text style={styles.issueFix}>{issue.suggestion}</Text>
                </View>
                <Text style={styles.issueContext} numberOfLines={2}>
                  …{issue.context}…
                </Text>
              </View>
              {isFixed ? (
                <View style={styles.fixedBadge}>
                  <Ionicons name="checkmark" size={14} color="#4ade80" />
                  <Text style={styles.fixedText}>Fixed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  testID={`fix-spell-${i}`}
                  onPress={() => onApply(i, issue)}
                  style={styles.fixBtn}
                >
                  <Text style={styles.fixBtnText}>Fix</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Grammar Results ────────────────────────────────────────────────────────

function GrammarResults({
  issues,
  appliedFixes,
  onApply,
}: {
  issues: GrammarIssue[];
  appliedFixes: Set<number>;
  onApply: (index: number, issue: GrammarIssue) => void;
}) {
  if (issues.length === 0) {
    return (
      <View style={styles.successWrap}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Grammar looks great</Text>
        <Text style={styles.successSub}>No issues detected.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.issueCount}>
        {issues.length} grammar issue{issues.length !== 1 ? "s" : ""} found
      </Text>
      {issues.map((issue, i) => {
        const isFixed = appliedFixes.has(i);
        return (
          <View key={`${issue.original.slice(0, 20)}-${i}`} style={styles.issueCard}>
            <Text style={styles.grammarOriginal} numberOfLines={3}>
              {issue.original}
            </Text>
            <View style={styles.issueRow}>
              <View style={styles.issueContent}>
                <View style={styles.wordRow}>
                  <Ionicons
                    name="arrow-forward-circle"
                    size={16}
                    color={theme.brand}
                  />
                  <Text style={styles.grammarSuggestion}>{issue.suggestion}</Text>
                </View>
                <Text style={styles.grammarExplanation}>
                  {issue.explanation}
                </Text>
              </View>
              {isFixed ? (
                <View style={styles.fixedBadge}>
                  <Ionicons name="checkmark" size={14} color="#4ade80" />
                  <Text style={styles.fixedText}>Fixed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  testID={`fix-grammar-${i}`}
                  onPress={() => onApply(i, issue)}
                  style={styles.fixBtn}
                >
                  <Text style={styles.fixBtnText}>Fix</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Tone Analysis Results ──────────────────────────────────────────────────

function ToneResults({ analysis }: { analysis: ToneAnalysis }) {
  return (
    <View>
      {/* Overall tone */}
      <View style={styles.toneOverall}>
        <Text style={styles.toneOverallLabel}>Overall Tone</Text>
        <Text style={styles.toneOverallValue}>{analysis.overall}</Text>
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.confidenceFill,
              { width: `${Math.round(analysis.confidence * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.confidenceText}>
          {Math.round(analysis.confidence * 100)}% confidence
        </Text>
      </View>

      {/* Attributes */}
      {analysis.attributes.length > 0 && (
        <View style={styles.attrsWrap}>
          <Text style={styles.attrsSectionTitle}>Voice Attributes</Text>
          {analysis.attributes.map((attr, i) => (
            <View key={attr.name} style={styles.attrRow}>
              <Text style={styles.attrName}>{attr.name}</Text>
              <View style={styles.attrBarWrap}>
                <View
                  style={[
                    styles.attrBar,
                    {
                      width: `${Math.round(attr.score * 100)}%`,
                      backgroundColor: getAttrColor(attr.score),
                    },
                  ]}
                />
              </View>
              <Text style={styles.attrValue}>{attr.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Rewrite suggestion */}
      {analysis.rewriteSuggestion && (
        <View style={styles.toneRewriteWrap}>
          <Text style={styles.toneRewriteTitle}>
            💡 Suggestion for more impact
          </Text>
          <Text style={styles.toneRewriteText}>
            {analysis.rewriteSuggestion}
          </Text>
        </View>
      )}
    </View>
  );
}

function getAttrColor(score: number): string {
  if (score < 0.33) return "#60a5fa"; // blue
  if (score < 0.66) return theme.brand; // amber
  return "#f97316"; // orange
}

// ─── Screenplay Results ─────────────────────────────────────────────────────

function ScreenplayResults({ text }: { text: string }) {
  return (
    <View>
      <View style={styles.screenplayHeader}>
        <Text style={styles.screenplayBadge}>🎬 SCREENPLAY FORMAT</Text>
      </View>
      <Text style={styles.screenplayText} selectable>
        {text}
      </Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: "90%",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  modelBadge: {
    color: theme.textTertiary,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    marginLeft: "auto",
  },

  modesRow: {
    gap: 10,
    paddingBottom: 14,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 150,
  },
  modeChipActive: {
    borderColor: theme.brand,
    backgroundColor: "rgba(255,176,0,0.08)",
  },
  modeChipDisabled: {
    opacity: 0.5,
  },
  modeIcon: {
    fontSize: 22,
  },
  modeLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  modeLabelActive: {
    color: theme.brand,
  },
  modeDesc: {
    color: theme.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },

  resultsBox: {
    minHeight: 160,
    maxHeight: 380,
    marginBottom: 14,
  },

  loadingWrap: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 14,
  },
  loadingText: {
    color: theme.textSecondary,
    fontSize: 14,
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyText: {
    color: theme.textTertiary,
    fontSize: 14,
  },

  successWrap: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  successIcon: {
    fontSize: 36,
  },
  successTitle: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: "600",
  },
  successSub: {
    color: theme.textSecondary,
    fontSize: 13,
  },

  issueCount: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  issueCard: {
    backgroundColor: theme.surfaceHi,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 10,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  issueContent: {
    flex: 1,
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  issueOriginal: {
    color: "#ff6b6b",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "line-through",
  },
  issueFix: {
    color: "#4ade80",
    fontSize: 15,
    fontWeight: "600",
  },
  issueContext: {
    color: theme.textTertiary,
    fontSize: 12,
    marginTop: 4,
    fontStyle: "italic",
  },

  fixBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.brand,
  },
  fixBtnText: {
    color: "#0A0A0B",
    fontWeight: "700",
    fontSize: 13,
  },

  fixedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(74,222,128,0.1)",
  },
  fixedText: {
    color: "#4ade80",
    fontSize: 12,
    fontWeight: "600",
  },

  grammarOriginal: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    backgroundColor: "rgba(255,107,107,0.08)",
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ff6b6b",
    overflow: "hidden",
  },
  grammarSuggestion: {
    color: "#4ade80",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  grammarExplanation: {
    color: theme.textTertiary,
    fontSize: 12,
    marginTop: 3,
  },

  // Tone
  toneOverall: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  toneOverallLabel: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  toneOverallValue: {
    color: theme.brand,
    fontSize: 24,
    fontWeight: "700",
  },
  confidenceBar: {
    width: 160,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: theme.brand,
    borderRadius: 2,
  },
  confidenceText: {
    color: theme.textTertiary,
    fontSize: 11,
  },

  attrsWrap: {
    marginTop: 12,
    gap: 10,
  },
  attrsSectionTitle: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  attrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attrName: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    width: 80,
  },
  attrBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  attrBar: {
    height: "100%",
    borderRadius: 3,
  },
  attrValue: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    width: 100,
    textAlign: "right",
  },

  toneRewriteWrap: {
    marginTop: 16,
    backgroundColor: theme.surfaceHi,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  toneRewriteTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  toneRewriteText: {
    color: theme.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },

  // Screenplay
  screenplayHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  screenplayBadge: {
    color: theme.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  screenplayText: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.select({ ios: "Courier New", default: "monospace" }),
  },

  // Streaming
  streamWrap: {
    padding: 12,
    backgroundColor: theme.surfaceHi,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  streamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  streamLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  streamText: {
    color: theme.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },

  // Actions
  actions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  btn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: {
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnGhostText: {
    color: theme.textPrimary,
    fontWeight: "600",
    fontSize: 15,
  },
});
