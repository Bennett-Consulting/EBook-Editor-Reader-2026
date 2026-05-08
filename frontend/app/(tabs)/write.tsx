import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { coverPalette, theme } from "../../src/lib/theme";
import { Book } from "../../src/lib/types";
import { getBooks, saveBook, deleteBook } from "../../src/lib/storage";
import { confirmAction } from "../../src/lib/dialogs";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function WriteTab() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Book[]>([]);

  const load = useCallback(async () => {
    const all = await getBooks();
    setDrafts(all.filter((b) => b.isDraft));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const newDraft = async () => {
    const book: Book = {
      id: makeId(),
      title: "Untitled",
      author: "You",
      content: "",
      format: "md",
      coverColor: coverPalette[Math.floor(Math.random() * coverPalette.length)],
      coverEmoji: "✍️",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      annotations: [],
      isDraft: true,
    };
    await saveBook(book);
    router.push(`/editor/${book.id}`);
  };

  const confirmDelete = (b: Book) => {
    confirmAction(
      "Delete draft?",
      `"${b.title || "Untitled"}" will be removed permanently.`,
      async () => {
        await deleteBook(b.id);
        await load();
      }
    );
  };

  const renderItem = ({ item, index }: { item: Book; index: number }) => (
    <TouchableOpacity
      testID={`draft-row-${index}`}
      activeOpacity={0.8}
      onPress={() => router.push(`/editor/${item.id}`)}
      style={styles.row}
    >
      <View style={[styles.swatch, { backgroundColor: item.coverColor }]}>
        <Text style={{ fontSize: 18 }}>{item.coverEmoji ?? "📝"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.title || "Untitled"}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {item.content.length} chars · {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        testID={`draft-delete-${index}`}
        onPress={() => confirmDelete(item)}
        hitSlop={10}
        style={styles.trashBtn}
      >
        <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
      </TouchableOpacity>
      <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR DRAFTS</Text>
          <Text style={styles.h1}>Write something{"\n"}worth reading.</Text>
        </View>
      </View>

      <TouchableOpacity testID="new-draft-btn" onPress={newDraft} style={styles.newCard}>
        <View style={styles.newIcon}>
          <Ionicons name="add" size={26} color="#0A0A0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.newTitle}>Start a new draft</Text>
          <Text style={styles.newSub}>AI assistant included</Text>
        </View>
        <Ionicons name="sparkles" size={18} color={theme.brand} />
      </TouchableOpacity>

      <FlatList
        testID="drafts-list"
        data={drafts}
        keyExtractor={(b) => b.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No drafts yet</Text>
            <Text style={styles.emptySub}>Tap “Start a new draft” above to begin.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  eyebrow: { color: theme.brand, fontSize: 11, fontWeight: "700", letterSpacing: 3, marginBottom: 8 },
  h1: { color: theme.textPrimary, fontSize: 34, fontWeight: "300", lineHeight: 38 },

  newCard: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  newIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.brand, alignItems: "center", justifyContent: "center",
  },
  newTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: "600" },
  newSub: { color: theme.textSecondary, fontSize: 13, marginTop: 2 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  swatch: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: theme.textSecondary, fontSize: 12, marginTop: 3 },
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,107,107,0.08)",
    marginRight: 4,
  },

  empty: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 6 },
  emptySub: { color: theme.textSecondary, fontSize: 14 },
});
