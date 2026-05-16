import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { theme } from "../../src/lib/theme";
import { ReaderPrefs } from "../../src/lib/types";
import { getPrefs, savePrefs, defaultPrefs } from "../../src/lib/storage";
import AIProviderSettings from "../../src/components/AIProviderSettings";

export default function SettingsScreen() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(defaultPrefs);

  useEffect(() => {
    getPrefs().then(setPrefs);
  }, []);

  const update = async (next: ReaderPrefs) => {
    setPrefs(next);
    await savePrefs(next);
  };

  const clearAll = () => {
    Alert.alert(
      "Erase all books?",
      "This deletes every book and draft from this device. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Erase",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert("Done", "Library cleared. Pull to refresh on the Library tab.");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>PREFERENCES</Text>
          <Text style={styles.h1}>Settings</Text>
        </View>

        <AIProviderSettings />

        <Text style={styles.section}>READING</Text>
        <View style={styles.card}>
          <RowCounter
            label="Font size"
            value={`${prefs.fontSize}px`}
            onMinus={() => update({ ...prefs, fontSize: Math.max(14, prefs.fontSize - 1) })}
            onPlus={() => update({ ...prefs, fontSize: Math.min(28, prefs.fontSize + 1) })}
            testID="font-size-row"
          />
          <Divider />
          <RowCounter
            label="Line height"
            value={prefs.lineHeight.toFixed(1)}
            onMinus={() =>
              update({ ...prefs, lineHeight: Math.max(1.4, +(prefs.lineHeight - 0.1).toFixed(1)) })
            }
            onPlus={() =>
              update({ ...prefs, lineHeight: Math.min(2.2, +(prefs.lineHeight + 0.1).toFixed(1)) })
            }
            testID="line-height-row"
          />
          <Divider />
          <RowSwitch
            label="Serif font"
            sub="Use a paper-style serif for body text"
            value={prefs.serif}
            onChange={(v) => update({ ...prefs, serif: v })}
            testID="serif-row"
          />
          <Divider />
          <RowSwitch
            label="Paper mode"
            sub="Light, sepia background for daytime reading"
            value={prefs.paperMode}
            onChange={(v) => update({ ...prefs, paperMode: v })}
            testID="paper-mode-row"
          />
        </View>

        <Text style={styles.section}>DATA</Text>
        <View style={styles.card}>
          <TouchableOpacity testID="erase-btn" style={styles.dangerRow} onPress={clearAll}>
            <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
            <Text style={styles.dangerText}>Erase all books</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Stored locally on this device · v1.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

function RowSwitch({
  label,
  sub,
  value,
  onChange,
  testID,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={value ? theme.brand : "#6b6b6f"}
        trackColor={{ false: "#2a2a2c", true: "rgba(255,176,0,0.4)" }}
      />
    </View>
  );
}

function RowCounter({
  label,
  value,
  onMinus,
  onPlus,
  testID,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
      <TouchableOpacity testID={`${testID}-minus`} onPress={onMinus} style={styles.counterBtn}>
        <Ionicons name="remove" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.counterValue}>{value}</Text>
      <TouchableOpacity testID={`${testID}-plus`} onPress={onPlus} style={styles.counterBtn}>
        <Ionicons name="add" size={18} color={theme.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  eyebrow: { color: theme.brand, fontSize: 11, fontWeight: "700", letterSpacing: 3, marginBottom: 8 },
  h1: { color: theme.textPrimary, fontSize: 34, fontWeight: "300" },
  section: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowLabel: { color: theme.textPrimary, fontSize: 15, fontWeight: "500" },
  rowSub: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
  counterBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.surfaceHi, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: theme.border,
  },
  counterValue: { color: theme.textPrimary, minWidth: 50, textAlign: "center", fontWeight: "600" },
  dangerRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  dangerText: { color: "#ff6b6b", fontSize: 15, fontWeight: "600" },
  footer: { color: theme.textTertiary, textAlign: "center", fontSize: 12, marginTop: 8 },
});
