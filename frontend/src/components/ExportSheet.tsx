import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";
import { exportBook, ExportFormat } from "../lib/exporter";
import { Book } from "../lib/types";

interface Props {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
}

const FORMATS: { key: ExportFormat; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "pdf",  label: "PDF",            sub: "For printing & reading anywhere", icon: "document-text-outline" },
  { key: "epub", label: "EPUB",           sub: "For e-readers (Kindle, Books)",   icon: "book-outline" },
  { key: "docx", label: "Word (.docx)",   sub: "For editing in Word / Google Docs", icon: "document-outline" },
  { key: "md",   label: "Markdown (.md)", sub: "Plain markdown source",           icon: "code-slash-outline" },
  { key: "txt",  label: "Plain text",     sub: "Universal text file",             icon: "text-outline" },
];

export default function ExportSheet({ visible, book, onClose }: Props) {
  const onPick = async (fmt: ExportFormat) => {
    if (!book) return;
    onClose();
    // small delay so the modal closes before the share sheet / download fires
    setTimeout(() => exportBook(book, fmt), 150);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Export book</Text>
          <Text style={styles.sub}>{book?.title ?? ""}</Text>
          {FORMATS.map((f) => (
            <TouchableOpacity
              key={f.key}
              testID={`export-${f.key}`}
              onPress={() => onPick(f.key)}
              style={styles.row}
              activeOpacity={0.85}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={f.icon} size={20} color={theme.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{f.label}</Text>
                <Text style={styles.rowSub}>{f.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            testID="export-cancel"
            onPress={onClose}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: theme.border,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },
  title: { color: theme.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 2 },
  sub: { color: theme.textSecondary, fontSize: 13, marginBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,176,0,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: "600" },
  rowSub: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  cancel: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  cancelText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
