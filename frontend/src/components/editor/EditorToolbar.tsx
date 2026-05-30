/**
 * EditorToolbar — Floating formatting toolbar
 *
 * Contains: undo/redo, bold/italic/heading, lists, quote,
 * AI assist, voice edit, and editing panel buttons.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../lib/theme";

// ─── Sub-components ─────────────────────────────────────────────────────────

export function ToolBtn({
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

export function ToolText({
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

// ─── Main Toolbar ───────────────────────────────────────────────────────────

interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onBold: () => void;
  onItalic: () => void;
  onHeading: () => void;
  onBullet: () => void;
  onNumberList: () => void;
  onQuote: () => void;
  onAI: () => void;
  onVoiceEdit: () => void;
  onEditingPanel: () => void;
}

export default function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onBold,
  onItalic,
  onHeading,
  onBullet,
  onNumberList,
  onQuote,
  onAI,
  onVoiceEdit,
  onEditingPanel,
}: EditorToolbarProps) {
  return (
    <View style={styles.toolbar} pointerEvents="box-none">
      <View style={styles.toolbarInner}>
        <ToolBtn icon="arrow-undo" onPress={onUndo} disabled={!canUndo} testID="tb-undo" />
        <ToolBtn icon="arrow-redo" onPress={onRedo} disabled={!canRedo} testID="tb-redo" />
        <View style={styles.tbSep} />
        <ToolText label="B" bold onPress={onBold} testID="tb-bold" />
        <ToolText label="i" italic onPress={onItalic} testID="tb-italic" />
        <ToolText label="H" onPress={onHeading} testID="tb-heading" />
        <ToolBtn icon="list" onPress={onBullet} testID="tb-bullet" />
        <ToolBtn icon="list-outline" onPress={onNumberList} testID="tb-numlist" />
        <ToolBtn icon="chatbox-outline" onPress={onQuote} testID="tb-quote" />
        <View style={styles.tbSep} />
        <TouchableOpacity testID="ai-btn" onPress={onAI} style={styles.aiBtn}>
          <Ionicons name="sparkles" size={16} color="#0A0A0B" />
          <Text style={styles.aiBtnText}>AI</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="voice-edit-btn" onPress={onVoiceEdit} style={styles.voiceEditBtn}>
          <Text style={styles.voiceEditBtnText}>🎭</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="editing-panel-btn"
          onPress={onEditingPanel}
          style={styles.editingPanelBtn}
        >
          <Ionicons name="construct-outline" size={16} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  voiceEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginLeft: 2,
  },
  voiceEditBtnText: { fontSize: 16 },
  editingPanelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginLeft: 2,
  },
});
