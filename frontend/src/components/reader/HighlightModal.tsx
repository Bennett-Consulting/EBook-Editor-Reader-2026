/**
 * HighlightModal — Add highlight + optional note to a paragraph.
 *
 * Extracted from reader/[id].tsx.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { theme } from "../../lib/theme";

interface HighlightModalProps {
  visible: boolean;
  paraText: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export default function HighlightModal({
  visible,
  paraText,
  onSave,
  onClose,
}: HighlightModalProps) {
  const [noteText, setNoteText] = useState("");

  const handleSave = () => {
    onSave(noteText);
    setNoteText("");
  };

  const handleClose = () => {
    setNoteText("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Highlight passage</Text>
          <Text numberOfLines={4} style={styles.previewQuote}>
            "{paraText}"
          </Text>
          <TextInput
            testID="note-input"
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Optional note…"
            placeholderTextColor={theme.textTertiary}
            style={styles.noteInput}
            multiline
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              testID="cancel-highlight"
              onPress={handleClose}
              style={[styles.btn, styles.btnGhost, { flex: 1 }]}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="save-highlight"
              onPress={handleSave}
              style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
            >
              <Text style={styles.btnPrimaryText}>Save highlight</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  previewQuote: {
    color: theme.textSecondary,
    fontStyle: "italic",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: theme.brand,
    paddingLeft: 12,
  },
  noteInput: {
    backgroundColor: theme.surfaceHi,
    color: theme.textPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: { backgroundColor: theme.surfaceHi, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
