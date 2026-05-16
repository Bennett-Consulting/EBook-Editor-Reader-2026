import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, coverPalette } from "../../src/lib/theme";
import { Book } from "../../src/lib/types";
import { getBook, saveBook, deleteBook } from "../../src/lib/storage";
import { aiSuggest, AIMode } from "../../src/lib/ai";
import { confirmAction } from "../../src/lib/dialogs";
import ExportSheet from "../../src/components/ExportSheet";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [coverColor, setCoverColor] = useState(coverPalette[0]);

  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiMode, setAiMode] = useState<AIMode>("continue");
  const [aiModelInfo, setAiModelInfo] = useState("");

  const [showMeta, setShowMeta] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const b = await getBook(String(id));
      if (b) {
        setBook(b);
        setTitle(b.title);
        setAuthor(b.author);
        setContent(b.content);
        setCoverColor(b.coverColor);
      }
    })();
  }, [id]);

  const persist = useCallback(
    (next: Partial<Book>) => {
      if (!book) return;
      const merged: Book = {
        ...book,
        title: title,
        author: author,
        content: content,
        coverColor: coverColor,
        ...next,
      };
      setBook(merged);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveBook(merged), 400);
    },
    [book, title, author, content, coverColor]
  );

  useEffect(() => {
    if (book) persist({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, author, content, coverColor]);

  const pushHistory = (prev: string) => {
    setHistory((h) => [...h.slice(-49), prev]);
    setRedoStack([]);
  };

  const onChangeContent = (text: string) => {
    if (text !== content) {
      pushHistory(content);
      setContent(text);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRedoStack((r) => [...r, content]);
    setContent(prev);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistory((h) => [...h, content]);
    setContent(next);
  };

  const insertAtCursor = (insertion: string, wrap?: { left: string; right: string }) => {
    const { start, end } = selectionRef.current;
    pushHistory(content);
    let next: string;
    let newPos: number;
    if (wrap && start !== end) {
      const selected = content.slice(start, end);
      next =
        content.slice(0, start) + wrap.left + selected + wrap.right + content.slice(end);
      newPos = end + wrap.left.length + wrap.right.length;
    } else if (wrap) {
      next = content.slice(0, start) + wrap.left + wrap.right + content.slice(end);
      newPos = start + wrap.left.length;
    } else {
      next = content.slice(0, start) + insertion + content.slice(end);
      newPos = start + insertion.length;
    }
    setContent(next);
    setTimeout(() => {
      inputRef.current?.setNativeProps?.({ selection: { start: newPos, end: newPos } });
    }, 30);
  };

  const formatBold = () => insertAtCursor("", { left: "**", right: "**" });
  const formatItalic = () => insertAtCursor("", { left: "_", right: "_" });
  const formatHeading = () => {
    const { start } = selectionRef.current;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    pushHistory(content);
    setContent(content.slice(0, lineStart) + "## " + content.slice(lineStart));
  };
  const formatBullet = () => {
    const { start } = selectionRef.current;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    pushHistory(content);
    setContent(content.slice(0, lineStart) + "- " + content.slice(lineStart));
  };
  const formatNumber = () => {
    const { start } = selectionRef.current;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    pushHistory(content);
    setContent(content.slice(0, lineStart) + "1. " + content.slice(lineStart));
  };
  const formatQuote = () => {
    const { start } = selectionRef.current;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    pushHistory(content);
    setContent(content.slice(0, lineStart) + "> " + content.slice(lineStart));
  };

  const askAI = async (mode: AIMode) => {
    if (!content.trim()) {
      Alert.alert("Nothing to work with", "Write at least a sentence first.");
      return;
    }
    Keyboard.dismiss();
    setShowAI(true);
    setAiMode(mode);
    setAiLoading(true);
    setAiSuggestion("");
    setAiModelInfo("");
    try {
      const tail = content.length > 1500 ? content.slice(-1500) : content;
      const res = await aiSuggest(tail, mode, book?.id);
      setAiSuggestion(res.suggestion);
      setAiModelInfo(`${res.provider} · ${res.model}`);
    } catch (e: any) {
      setAiSuggestion(`Couldn't reach the AI assistant.\n${e?.message ?? ""}`);
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAI = () => {
    if (!aiSuggestion) return;
    pushHistory(content);
    const sep = content.endsWith("\n") || content.length === 0 ? "" : "\n\n";
    setContent(content + sep + aiSuggestion);
    setShowAI(false);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  if (!book) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ color: theme.textSecondary, padding: 24 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <TouchableOpacity testID="editor-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.tbTitle} numberOfLines={1}>
            {title || "Untitled"}
          </Text>
          <Text style={styles.tbMeta}>{wordCount} words · saved</Text>
        </View>
        <TouchableOpacity testID="editor-meta" onPress={() => setShowMeta(true)} style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 22, paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            testID="editor-title"
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.textTertiary}
            style={styles.titleInput}
            multiline
            spellCheck={true}
            autoCapitalize="sentences"
          />
          <TextInput
            testID="editor-author"
            value={author}
            onChangeText={setAuthor}
            placeholder="Author"
            placeholderTextColor={theme.textTertiary}
            style={styles.authorInput}
          />
          <View style={styles.divider} />
          <TextInput
            ref={inputRef}
            testID="editor-content"
            value={content}
            onChangeText={onChangeContent}
            onSelectionChange={(e) => (selectionRef.current = e.nativeEvent.selection)}
            placeholder="Once upon a time…"
            placeholderTextColor={theme.textTertiary}
            style={styles.contentInput}
            multiline
            textAlignVertical="top"
            spellCheck={true}
            autoCapitalize="sentences"
          />
        </ScrollView>

        {/* Floating Toolbar */}
        <View style={styles.toolbar} pointerEvents="box-none">
          <View style={styles.toolbarInner}>
            <ToolBtn icon="arrow-undo" onPress={undo} disabled={!history.length} testID="tb-undo" />
            <ToolBtn icon="arrow-redo" onPress={redo} disabled={!redoStack.length} testID="tb-redo" />
            <View style={styles.tbSep} />
            <ToolText label="B" bold onPress={formatBold} testID="tb-bold" />
            <ToolText label="i" italic onPress={formatItalic} testID="tb-italic" />
            <ToolText label="H" onPress={formatHeading} testID="tb-heading" />
            <ToolBtn icon="list" onPress={formatBullet} testID="tb-bullet" />
            <ToolBtn icon="list-outline" onPress={formatNumber} testID="tb-numlist" />
            <ToolBtn icon="chatbox-outline" onPress={formatQuote} testID="tb-quote" />
            <View style={styles.tbSep} />
            <TouchableOpacity
              testID="ai-btn"
              onPress={() => askAI("continue")}
              style={styles.aiBtn}
            >
              <Ionicons name="sparkles" size={16} color="#0A0A0B" />
              <Text style={styles.aiBtnText}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* AI Drawer */}
      <Modal visible={showAI} transparent animationType="slide" onRequestClose={() => setShowAI(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowAI(false)}>
          <Pressable style={styles.aiSheet}>
            <View style={styles.handle} />
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={18} color={theme.brand} />
              <Text style={styles.aiTitle}>AI assistant</Text>
              {aiModelInfo ? (
                <Text style={{ color: theme.textTertiary, fontSize: 11, fontFamily: "monospace" }}>
                  {aiModelInfo}
                </Text>
              ) : null}
            </View>
            <View style={styles.aiModes}>
              {(["continue", "improve", "shorten", "expand"] as AIMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  testID={`ai-mode-${m}`}
                  onPress={() => askAI(m)}
                  style={[
                    styles.aiChip,
                    aiMode === m && { backgroundColor: theme.brand, borderColor: theme.brand },
                  ]}
                >
                  <Text
                    style={{
                      color: aiMode === m ? "#0A0A0B" : theme.textPrimary,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView style={styles.aiBox}>
              {aiLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 28 }}>
                  <ActivityIndicator color={theme.brand} />
                  <Text style={{ color: theme.textSecondary, marginTop: 12 }}>
                    Thinking…
                  </Text>
                </View>
              ) : (
                <Text style={styles.aiText}>
                  {aiSuggestion || "Pick a mode above to get a suggestion."}
                </Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                testID="ai-cancel"
                onPress={() => setShowAI(false)}
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
              >
                <Text style={styles.btnGhostText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="ai-accept"
                onPress={acceptAI}
                disabled={!aiSuggestion || aiLoading}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { flex: 1, opacity: aiSuggestion && !aiLoading ? 1 : 0.5 },
                ]}
              >
                <Text style={styles.btnPrimaryText}>Insert into book</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Meta sheet */}
      <Modal visible={showMeta} transparent animationType="slide" onRequestClose={() => setShowMeta(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowMeta(false)}>
          <Pressable style={styles.aiSheet}>
            <View style={styles.handle} />
            <Text style={styles.aiTitle}>Cover</Text>
            <View style={[styles.coverPreview, { backgroundColor: coverColor }]}>
              <Text style={styles.coverPreviewEmoji}>{book.coverEmoji ?? "📘"}</Text>
              <Text numberOfLines={2} style={styles.coverPreviewTitle}>
                {title || "Untitled"}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {coverPalette.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCoverColor(c)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: c,
                      borderColor: coverColor === c ? theme.brand : "transparent",
                    },
                  ]}
                />
              ))}
            </ScrollView>
            <TouchableOpacity
              testID="export-btn"
              onPress={() => {
                setShowMeta(false);
                setTimeout(() => setShowExport(true), 150);
              }}
              style={[styles.btn, styles.btnGhost, { marginTop: 14 }]}
            >
              <Ionicons name="share-outline" size={18} color={theme.textPrimary} />
              <Text style={[styles.btnGhostText, { marginLeft: 8 }]}>Export…</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="preview-btn"
              onPress={() => {
                setShowMeta(false);
                router.push(`/reader/${book.id}`);
              }}
              style={[styles.btn, styles.btnGhost, { marginTop: 10 }]}
            >
              <Ionicons name="eye-outline" size={18} color={theme.textPrimary} />
              <Text style={[styles.btnGhostText, { marginLeft: 8 }]}>Preview as reader</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="delete-book-btn"
              onPress={() => {
                confirmAction(
                  "Delete book?",
                  `"${title || "Untitled"}" will be removed permanently. This cannot be undone.`,
                  async () => {
                    await deleteBook(book.id);
                    setShowMeta(false);
                    router.replace("/");
                  }
                );
              }}
              style={[styles.btn, styles.btnDanger, { marginTop: 10 }]}
            >
              <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
              <Text style={[styles.btnDangerText, { marginLeft: 8 }]}>Delete book</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ExportSheet
        visible={showExport}
        book={book ? { ...book, title, author, content, coverColor } : null}
        onClose={() => setShowExport(false)}
      />
    </SafeAreaView>
  );
}

function ToolBtn({
  icon,
  onPress,
  disabled,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.tbBtn, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={18} color={theme.textPrimary} />
    </TouchableOpacity>
  );
}

function ToolText({
  label,
  bold,
  italic,
  onPress,
  testID,
}: {
  label: string;
  bold?: boolean;
  italic?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} style={styles.tbBtn}>
      <Text
        style={{
          color: theme.textPrimary,
          fontWeight: bold ? "800" : "600",
          fontStyle: italic ? "italic" : "normal",
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  topbar: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tbTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: "600", maxWidth: 220 },
  tbMeta: { color: theme.textSecondary, fontSize: 11, marginTop: 1 },

  titleInput: {
    color: theme.textPrimary,
    fontSize: 30,
    fontWeight: "700",
    paddingVertical: 4,
    letterSpacing: -0.5,
  },
  authorInput: {
    color: theme.textSecondary,
    fontSize: 14,
    marginTop: 6,
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 18,
  },
  contentInput: {
    color: theme.reading,
    fontSize: 17,
    lineHeight: 28,
    minHeight: 360,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },

  toolbar: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toolbarInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(28,28,30,0.96)",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  tbBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tbSep: {
    width: 1,
    height: 22,
    backgroundColor: theme.border,
    marginHorizontal: 4,
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.brand,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    marginLeft: 4,
  },
  aiBtnText: { color: "#0A0A0B", fontWeight: "800", fontSize: 13 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  aiSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  aiTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "600" },
  aiModes: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  aiChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
  },
  aiBox: {
    backgroundColor: theme.surfaceHi,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 120,
    maxHeight: 280,
    marginBottom: 14,
  },
  aiText: { color: theme.textPrimary, fontSize: 15, lineHeight: 22 },

  coverPreview: {
    width: "100%",
    aspectRatio: 1.6,
    borderRadius: 14,
    padding: 18,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  coverPreviewEmoji: { fontSize: 32 },
  coverPreviewTitle: { color: "#0A0A0B", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 2,
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
  btnGhost: { backgroundColor: theme.surfaceHi, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
  btnDanger: { backgroundColor: "rgba(255,107,107,0.10)", borderWidth: 1, borderColor: "rgba(255,107,107,0.35)" },
  btnDangerText: { color: "#ff6b6b", fontWeight: "600", fontSize: 15 },
});
