/**
 * ExportSheet — Enhanced export modal with format cards and progress
 *
 * PR #8: Added export progress indicator, word/chapter count,
 * format descriptions, and success feedback.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
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

const FORMATS: {
  key: ExportFormat;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}[] = [
  {
    key: "pdf",
    label: "PDF",
    sub: "Title page, table of contents, page breaks at chapters",
    icon: "document-text-outline",
    badge: "Best for print",
  },
  {
    key: "epub",
    label: "EPUB",
    sub: "Multi-chapter EPUB with navigation and styling",
    icon: "book-outline",
    badge: "E-readers",
  },
  {
    key: "docx",
    label: "Word (.docx)",
    sub: "Proper headings, page numbers, Georgia font",
    icon: "document-outline",
    badge: "Editable",
  },
  {
    key: "md",
    label: "Markdown",
    sub: "Clean markdown with notes appendix",
    icon: "code-slash-outline",
  },
  {
    key: "txt",
    label: "Plain text",
    sub: "Universal text file, no formatting",
    icon: "text-outline",
  },
];

export default function ExportSheet({ visible, book, onClose }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [progressMsg, setProgressMsg] = useState("");

  const stats = useMemo(() => {
    if (!book) return { words: 0, chapters: 0 };
    const words = (book.content || "").split(/\s+/).filter(Boolean).length;
    const chapters = (book.content || "")
      .split(/\n\s*\n/)
      .filter((p) => /^#{1,2}\s/.test(p.trim()) || /^chapter\s+\d+/i.test(p.trim())).length;
    return { words, chapters };
  }, [book]);

  const onPick = async (fmt: ExportFormat) => {
    if (!book || exporting) return;
    setExporting(true);
    setExportFormat(fmt);
    setProgressMsg("Starting export…");
    try {
      await exportBook(book, fmt, (stage) => setProgressMsg(stage));
    } finally {
      setExporting(false);
      setExportFormat(null);
      setProgressMsg("");
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={exporting ? undefined : onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Export book</Text>

          {/* Book info */}
          <View style={styles.bookInfo}>
            <Text numberOfLines={1} style={styles.bookTitle}>
              {book?.title ?? ""}
            </Text>
            <Text style={styles.bookStats}>
              {stats.words.toLocaleString()} words
              {stats.chapters > 0 ? ` · ${stats.chapters} chapter${stats.chapters !== 1 ? "s" : ""}` : ""}
              {book?.annotations.length ? ` · ${book.annotations.length} note${book.annotations.length !== 1 ? "s" : ""}` : ""}
            </Text>
          </View>

          {/* Format list */}
          {FORMATS.map((f) => {
            const isExporting = exporting && exportFormat === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`export-${f.key}`}
                onPress={() => onPick(f.key)}
                disabled={exporting}
                style={[styles.row, exporting && !isExporting && { opacity: 0.4 }]}
                activeOpacity={0.85}
              >
                <View style={styles.iconWrap}>
                  {isExporting ? (
                    <ActivityIndicator color={theme.brand} size="small" />
                  ) : (
                    <Ionicons name={f.icon} size={20} color={theme.brand} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.rowTitle}>{f.label}</Text>
                    {f.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{f.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowSub}>
                    {isExporting ? progressMsg : f.sub}
                  </Text>
                </View>
                {!isExporting && (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textTertiary}
                  />
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            testID="export-cancel"
            onPress={onClose}
            disabled={exporting}
            style={[styles.cancel, exporting && { opacity: 0.4 }]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
    padding: 18,
    paddingBottom: Platform.OS === "ios" ? 36 : 28,
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
  title: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },

  bookInfo: {
    backgroundColor: theme.surfaceHi,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 14,
    marginTop: 4,
  },
  bookTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  bookStats: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },

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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,176,0,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  rowSub: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: "rgba(255,176,0,0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: theme.brand,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  cancel: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  cancelText: {
    color: theme.textPrimary,
    fontWeight: "600",
    fontSize: 15,
  },
});
