/**
 * AnnotationsSheet — Lists all highlights & notes for a book.
 *
 * Extracted from reader/[id].tsx for cleaner separation.
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../lib/theme";
import { Annotation } from "../../lib/types";

interface AnnotationsSheetProps {
  visible: boolean;
  annotations: Annotation[];
  onRemove: (annId: string) => void;
  onClose: () => void;
}

export default function AnnotationsSheet({
  visible,
  annotations,
  onRemove,
  onClose,
}: AnnotationsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { maxHeight: "75%" }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Highlights & notes</Text>
          <ScrollView style={{ maxHeight: 460 }}>
            {annotations.length === 0 ? (
              <Text style={{ color: theme.textSecondary, paddingVertical: 12 }}>
                Long-press any paragraph in the reader to highlight it.
              </Text>
            ) : (
              annotations.map((a) => (
                <View key={a.id} style={styles.annItem}>
                  <View style={styles.annBar} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={3} style={styles.annText}>
                      {a.text}
                    </Text>
                    {a.note ? <Text style={styles.annNote}>{a.note}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => onRemove(a.id)}>
                    <Ionicons name="close" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
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
    padding: 20,
    paddingBottom: 30,
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
  sheetTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: "600", marginBottom: 12 },
  annItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  annBar: { width: 3, backgroundColor: theme.brand, borderRadius: 2, alignSelf: "stretch" },
  annText: { color: theme.textPrimary, fontSize: 14, lineHeight: 20 },
  annNote: { color: theme.brand, fontSize: 13, marginTop: 6, fontStyle: "italic" },
});
