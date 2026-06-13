import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { coverPalette, sampleBookContent, theme } from "../../src/lib/theme";
import { Book } from "../../src/lib/types";
import { getBooks, saveBook, deleteBook, importEpubFromUri } from "../../src/lib/storage";

const DEMO_SEEDED_KEY = "@ebook/demo-seeded";
import { confirmAction } from "../../src/lib/dialogs";
import EmptyState from "../../src/components/EmptyState";
import BookCardSkeleton from "../../src/components/BookCardSkeleton";

const { width } = Dimensions.get("window");
const COL = 2;
const GAP = 16;
const CARD_W = (width - GAP * 3) / COL;
const CARD_H = CARD_W * 1.45;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Strip HTML tags, control characters (C0/C1), and BOM from imported text.
 * Fix: Previously only stripped null bytes; now catches all control chars.
 */
function sanitize(s: string) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFEFF]/g, "")
    .trim();
}

export default function LibraryScreen() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newColor, setNewColor] = useState(coverPalette[0]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await getBooks();
    if (list.length === 0) {
      // Seed with one demo book — but only once (don't re-seed after user deletes all)
      const alreadySeeded = await AsyncStorage.getItem(DEMO_SEEDED_KEY);
      if (!alreadySeeded) {
        const demo: Book = {
          id: makeId(),
          title: "The Quiet Room",
          author: "M. Aren",
          content: sampleBookContent,
          format: "md",
          coverColor: "#FFB000",
          coverEmoji: "📖",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          progress: 0,
          annotations: [],
          isDraft: false,
        };
        setBooks([demo]);
        await saveBook(demo);
        await AsyncStorage.setItem(DEMO_SEEDED_KEY, "1");
      } else {
        setBooks([]);
      }
    } else {
      setBooks(list);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Safety net for web (idb timing): also load on mount.
  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const importFile = async () => {
    setImportError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/plain",
          "text/markdown",
          "text/x-markdown",
          "application/epub+zip",
          ".txt",
          ".md",
          ".epub",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.name || "Untitled";
      const lower = name.toLowerCase();

      setImporting(true);

      if (lower.endsWith(".epub")) {
        const coverColor = coverPalette[Math.floor(Math.random() * coverPalette.length)];
        await importEpubFromUri(asset.uri, name, coverColor);
      } else {
        let format: Book["format"] = lower.endsWith(".md") || lower.endsWith(".markdown") ? "md" : "txt";
        let content = "";
        try {
          const file = new File(asset.uri);
          content = await file.text();
        } catch {
          const r = await fetch(asset.uri);
          content = await r.text();
        }
        content = sanitize(content);
        if (!content) throw new Error("This file appears to be empty.");
        const book: Book = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          title: name.replace(/\.(txt|md|markdown)$/i, "").slice(0, 80) || "Untitled",
          author: "Imported",
          content,
          format,
          coverColor: coverPalette[Math.floor(Math.random() * coverPalette.length)],
          coverEmoji: format === "md" ? "📝" : "📄",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          progress: 0,
          annotations: [],
          isDraft: false,
        };
        await saveBook(book);
      }

      await load();
    } catch (e: any) {
      setImportError(e?.message ?? "Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const createBook = async () => {
    const t = newTitle.trim() || "Untitled";
    const a = newAuthor.trim() || "Anonymous";
    const book: Book = {
      id: makeId(),
      title: t,
      author: a,
      content: "",
      format: "md",
      coverColor: newColor,
      coverEmoji: "✍️",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      annotations: [],
      isDraft: true,
    };
    await saveBook(book);
    setCreateOpen(false);
    setNewTitle("");
    setNewAuthor("");
    setNewColor(coverPalette[0]);
    await load();
    router.push(`/editor/${book.id}`);
  };

  const onLongPress = (b: Book) => {
    confirmAction(
      `Delete "${b.title}"?`,
      "This book will be removed permanently from your device.",
      async () => {
        await deleteBook(b.id);
        await load();
      }
    );
  };

  const renderItem = ({ item, index }: { item: Book; index: number }) => {
    return (
      <TouchableOpacity
        testID={`book-card-${index}`}
        activeOpacity={0.85}
        onPress={() => router.push(`/reader/${item.id}`)}
        onLongPress={() => onLongPress(item)}
        style={[styles.card, { width: CARD_W }]}
      >
        <View style={[styles.cover, { backgroundColor: item.coverColor, height: CARD_H }]}>
          <View style={styles.coverShine} />
          <Text style={styles.coverEmoji}>{item.coverEmoji ?? "📘"}</Text>
          <View style={styles.coverTitleWrap}>
            <Text numberOfLines={3} style={styles.coverTitle}>
              {item.title}
            </Text>
          </View>
          {item.isDraft && (
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>DRAFT</Text>
            </View>
          )}
          <TouchableOpacity
            testID={`book-edit-${index}`}
            onPress={(e) => {
              e.stopPropagation?.();
              router.push(`/editor/${item.id}`);
            }}
            style={styles.editBadge}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={16} color="#0A0A0B" />
          </TouchableOpacity>
        </View>
        <Text numberOfLines={1} style={styles.bookTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.bookAuthor}>
          {item.author}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(2, Math.round((item.progress || 0) * 100))}%` },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
          <Text style={styles.h1}>Read. Write.{"\n"}Wander.</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            testID="import-btn"
            onPress={importFile}
            style={styles.iconBtn}
          >
            <Ionicons name="cloud-upload-outline" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="create-book-btn"
            onPress={() => setCreateOpen(true)}
            style={[styles.iconBtn, styles.iconBtnPrimary]}
          >
            <Ionicons name="add" size={24} color="#0A0A0B" />
          </TouchableOpacity>
        </View>
      </View>

      {importing && (
        <View testID="import-loading" style={styles.importBanner}>
          <Ionicons name="cloud-upload-outline" size={16} color={theme.brand} />
          <Text style={styles.importBannerText}>Importing…</Text>
        </View>
      )}
      {importError && (
        <View style={styles.importBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#ff6b6b" />
          <Text testID="import-error" style={[styles.importBannerText, { color: "#ff6b6b" }]}>
            {importError}
          </Text>
          <TouchableOpacity onPress={() => setImportError(null)} hitSlop={10}>
            <Ionicons name="close" size={16} color="#ff6b6b" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        testID="library-grid"
        data={books}
        keyExtractor={(b) => b.id}
        renderItem={renderItem}
        numColumns={COL}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: GAP }}
        contentContainerStyle={{ gap: GAP, paddingTop: 8, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.brand}
          />
        }
        ListEmptyComponent={
          loading ? (
            <BookCardSkeleton count={4} />
          ) : (
            <EmptyState
              testID="library-empty"
              icon="library-outline"
              title="Your library is empty"
              subtitle="Import a .txt, .md, or .epub — or start writing something new."
              action={{
                label: "Create a book",
                icon: "add",
                onPress: () => setCreateOpen(true),
              }}
            />
          )
        }
      />

      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Book</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              testID="new-title-input"
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="A working title…"
              placeholderTextColor={theme.textTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>Author</Text>
            <TextInput
              testID="new-author-input"
              value={newAuthor}
              onChangeText={setNewAuthor}
              placeholder="Your name"
              placeholderTextColor={theme.textTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>Cover color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {coverPalette.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewColor(c)}
                  style={[
                    styles.swatch,
                    { backgroundColor: c, borderColor: newColor === c ? theme.brand : "transparent" },
                  ]}
                />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setCreateOpen(false)}
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="create-confirm-btn"
                onPress={createBook}
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
              >
                <Text style={styles.btnPrimaryText}>Start writing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  eyebrow: {
    color: theme.brand,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 8,
  },
  h1: { color: theme.textPrimary, fontSize: 34, fontWeight: "300", lineHeight: 38 },
  headerActions: { flexDirection: "row", gap: 10 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPrimary: { backgroundColor: theme.brand, borderColor: theme.brand },
  importBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  importBannerText: { color: theme.brand, fontSize: 13, fontWeight: "600", flex: 1 },

  card: {},
  cover: {
    borderRadius: 14,
    padding: 14,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  coverShine: {
    position: "absolute",
    top: -20,
    left: -10,
    width: 90,
    height: 90,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.18)",
    opacity: 0.7,
  },
  coverEmoji: { fontSize: 28 },
  coverTitleWrap: { marginTop: "auto" },
  coverTitle: {
    color: "#0A0A0B",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  draftBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  draftBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  editBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  bookTitle: { color: theme.textPrimary, marginTop: 10, fontSize: 14, fontWeight: "600" },
  bookAuthor: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: theme.brand, borderRadius: 2 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, paddingHorizontal: 24 },
  emptyTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 6 },
  emptySub: { color: theme.textSecondary, fontSize: 14, textAlign: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: { color: theme.textPrimary, fontSize: 22, fontWeight: "600", marginBottom: 16 },
  label: { color: theme.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6 },
  input: {
    backgroundColor: theme.surfaceHi,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
  },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: { backgroundColor: theme.surfaceHi, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
