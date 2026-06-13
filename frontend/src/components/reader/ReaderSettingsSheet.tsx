/**
 * ReaderSettingsSheet — Font size, line height, serif, paper mode controls.
 *
 * Extracted from reader/[id].tsx to keep the screen lean.
 */

import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../lib/theme";
import { ReaderPrefs } from "../../lib/types";

// ─── Sub-components ─────────────────────────────────────────────────────────

function SheetCounter({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.row, { paddingVertical: 10 }]}>
      <Text style={{ color: theme.textPrimary, flex: 1 }}>{label}</Text>
      <TouchableOpacity onPress={onMinus} style={styles.counterBtn}>
        <Ionicons name="remove" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.counterValue}>{value}</Text>
      <TouchableOpacity onPress={onPlus} style={styles.counterBtn}>
        <Ionicons name="add" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

function ToggleChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: theme.brand, borderColor: theme.brand },
      ]}
    >
      <Text style={{ color: active ? "#0A0A0B" : theme.textPrimary, fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ReaderSettingsSheetProps {
  visible: boolean;
  prefs: ReaderPrefs;
  onUpdatePrefs: (next: ReaderPrefs) => void;
  onClose: () => void;
}

export default function ReaderSettingsSheet({
  visible,
  prefs,
  onUpdatePrefs,
  onClose,
}: ReaderSettingsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Reading</Text>
          <SheetCounter
            label="Font size"
            value={`${prefs.fontSize}px`}
            onMinus={() =>
              onUpdatePrefs({ ...prefs, fontSize: Math.max(14, prefs.fontSize - 1) })
            }
            onPlus={() =>
              onUpdatePrefs({ ...prefs, fontSize: Math.min(28, prefs.fontSize + 1) })
            }
          />
          <SheetCounter
            label="Line height"
            value={prefs.lineHeight.toFixed(1)}
            onMinus={() =>
              onUpdatePrefs({
                ...prefs,
                lineHeight: Math.max(1.4, +(prefs.lineHeight - 0.1).toFixed(1)),
              })
            }
            onPlus={() =>
              onUpdatePrefs({
                ...prefs,
                lineHeight: Math.min(2.2, +(prefs.lineHeight + 0.1).toFixed(1)),
              })
            }
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <ToggleChip
              active={prefs.serif}
              label="Serif"
              onPress={() => onUpdatePrefs({ ...prefs, serif: !prefs.serif })}
            />
            <ToggleChip
              active={prefs.paperMode}
              label="Paper mode"
              onPress={() => onUpdatePrefs({ ...prefs, paperMode: !prefs.paperMode })}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceHi,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  counterValue: {
    color: theme.textPrimary,
    minWidth: 50,
    textAlign: "center",
    fontWeight: "600",
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
