/**
 * AI Provider Settings — Provider picker + key entry.
 *
 * Step 1: Pick from the provider table (or Custom).
 * Step 2: Console link opens, paste/import key, validate & save.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";
import { SavedAIKey } from "../lib/types";
import {
  getAIKeys,
  saveAIKey,
  deleteAIKey,
  getActiveAIKeyId,
  setActiveAIKeyId,
} from "../lib/storage";
import { maskKey, validateKey } from "../lib/aiGateway";
import {
  ProviderEntry,
  getProviderTable,
  detectProviderFromTable,
} from "../lib/providerTable";

// Map providerTable id → aiGateway AIProvider type
const TABLE_ID_TO_PROVIDER: Record<string, string> = {
  openai: "openai",
  google: "google",
  anthropic: "anthropic",
  groq: "groq",
  ollama: "ollama",
  bitnet: "bitnet",
  huggingface: "openai",   // OpenAI-compatible
  together: "openai",
  perplexity: "openai",
  fireworks: "openai",
  deepinfra: "openai",
  openrouter: "openai",
  xai: "openai",
  deepseek: "openai",
  anyscale: "openai",
  mistral: "openai",
  cohere: "custom",
  replicate: "custom",
  aws: "custom",
  azure: "openai",
};

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const CUSTOM_ENTRY: ProviderEntry = {
  id: "custom",
  name: "Custom / Private Server",
  icon: "🔧",
  keyOnlyShownOnce: false,
  openaiCompatible: true,
  isCustom: true,
};

type Step = "pick" | "enter";

export default function AIProviderSettings() {
  const [keys, setKeys] = useState<SavedAIKey[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [providerTable, setProviderTable] = useState<ProviderEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ProviderEntry | null>(null);
  const [newKeyText, setNewKeyText] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const keyInputRef = useRef<any>(null);

  const load = useCallback(async () => {
    const [savedKeys, active, table] = await Promise.all([
      getAIKeys(),
      getActiveAIKeyId(),
      getProviderTable(),
    ]);
    setKeys(savedKeys);
    setActiveId(active);
    setProviderTable(table);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setStep("pick");
    setSelectedEntry(null);
    setNewKeyText("");
    setNewLabel("");
    setNewBaseUrl("");
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setSelectedEntry(null);
    setNewKeyText("");
    setNewLabel("");
    setNewBaseUrl("");
  };

  const pickProvider = (entry: ProviderEntry) => {
    setSelectedEntry(entry);
    setStep("enter");
    if (entry.consoleUrl) {
      Linking.openURL(entry.consoleUrl);
    }
  };

  const openClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text?.trim()) setNewKeyText(text.trim());
    keyInputRef.current?.focus();
  };

  const importFromFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", ".txt", ".key"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = new File(res.assets[0].uri);
      const text = await file.text();
      const key = text.trim().split(/\s+/)[0];
      if (key) setNewKeyText(key);
      else Alert.alert("Empty file", "The file didn't contain a key.");
    } catch (e: any) {
      Alert.alert("Import failed", e?.message ?? "Could not read file.");
    }
  };

  const handleAdd = async () => {
    const key = newKeyText.trim();
    if (!key) {
      Alert.alert("No key entered", "Paste your API key to continue.");
      return;
    }

    // Resolve gateway provider type
    const entryId = selectedEntry?.id ?? "custom";
    const gatewayProvider = (TABLE_ID_TO_PROVIDER[entryId] ?? "custom") as any;
    const baseUrl = newBaseUrl.trim() || selectedEntry?.customBaseUrl || undefined;

    setValidating(true);
    const result = await validateKey(gatewayProvider, key, baseUrl);
    setValidating(false);

    const label =
      newLabel.trim() ||
      `${selectedEntry?.name ?? "Custom"}${result.modelCount ? ` (${result.modelCount} models)` : ""}`;

    // Auto-detect from table if provider is ambiguous
    const detected = detectProviderFromTable(key, providerTable);
    const finalEntry = selectedEntry?.id === "custom" && detected ? detected : selectedEntry;

    const savedKey: SavedAIKey = {
      id: makeId(),
      provider: gatewayProvider,
      apiKey: key,
      label,
      customBaseUrl: baseUrl,
      addedAt: new Date().toISOString(),
      lastValidated: result.valid ? new Date().toISOString() : undefined,
      modelCount: result.modelCount,
    };

    await saveAIKey(savedKey);

    const currentKeys = await getAIKeys();
    if (currentKeys.length === 1 || (result.valid && !activeId)) {
      await setActiveAIKeyId(savedKey.id);
    }

    if (!result.valid) {
      Alert.alert(
        "Key saved with warning",
        `Saved but validation returned: ${result.error || "unknown error"}. Check for typos or missing characters.`
      );
    }

    closeAdd();
    await load();
  };

  const handleSetActive = async (id: string) => {
    await setActiveAIKeyId(id);
    setActiveId(id);
  };

  const handleDelete = (k: SavedAIKey) => {
    Alert.alert(
      `Remove ${k.label}?`,
      "This key will be deleted from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => { await deleteAIKey(k.id); await load(); },
        },
      ]
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View>
      <Text style={styles.section}>AI PROVIDERS</Text>
      <View style={styles.card}>
        {keys.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="key-outline" size={20} color={theme.textTertiary} />
            <Text style={styles.emptyText}>
              No API keys yet. Add one to enable the AI assistant.
            </Text>
          </View>
        ) : (
          keys.map((k) => {
            const isActive = activeId === k.id;
            const entry = providerTable.find((e) => e.id === k.provider) ??
              { icon: "🔧", name: k.provider };
            return (
              <View key={k.id}>
                <TouchableOpacity
                  style={styles.keyRow}
                  onPress={() => handleSetActive(k.id)}
                  onLongPress={() => handleDelete(k)}
                >
                  <View style={[styles.radio, isActive && styles.radioActive]}>
                    {isActive && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.keyHeader}>
                      <Text style={styles.providerIcon}>{entry.icon}</Text>
                      <Text style={[styles.keyLabel, isActive && { color: theme.brand }]} numberOfLines={1}>
                        {k.label}
                      </Text>
                    </View>
                    <Text style={styles.keyMeta}>
                      {maskKey(k.apiKey)}
                      {k.modelCount ? ` · ${k.modelCount} models` : ""}
                      {k.lastValidated ? " · ✓ verified" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(k)} hitSlop={10} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
                  </TouchableOpacity>
                </TouchableOpacity>
                <View style={styles.separator} />
              </View>
            );
          })
        )}
        <TouchableOpacity style={styles.addRow} onPress={openAdd}>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={18} color={theme.brand} />
          </View>
          <Text style={styles.addText}>Add API key</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Keys are stored locally on this device only — never sent anywhere except directly to your chosen provider.
      </Text>

      {/* ── Add Key Modal ─────────────────────────────────────────────────── */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={closeAdd}>
        <Pressable style={styles.backdrop} onPress={closeAdd}>
          <Pressable style={styles.sheet}>
            <View style={styles.handle} />

            {/* ── Step 1: Pick provider ─────────────────────────────────── */}
            {step === "pick" && (
              <>
                <Text style={styles.sheetTitle}>Choose Provider</Text>

                {/* Section: copyable anytime */}
                <Text style={styles.sectionLabel}>KEY AVAILABLE ANYTIME</Text>
                <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
                  {providerTable
                    .filter((e) => !e.keyOnlyShownOnce && !e.isCustom)
                    .map((entry) => (
                      <ProviderRow key={entry.id} entry={entry} onPress={() => pickProvider(entry)} />
                    ))}

                  {/* Section: shown once */}
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>KEY SHOWN ONCE ONLY ⚠️</Text>
                  {providerTable
                    .filter((e) => e.keyOnlyShownOnce && !e.isCustom)
                    .map((entry) => (
                      <ProviderRow key={entry.id} entry={entry} onPress={() => pickProvider(entry)} />
                    ))}

                  {/* Custom / Private */}
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>OTHER</Text>
                  <ProviderRow entry={CUSTOM_ENTRY} onPress={() => pickProvider(CUSTOM_ENTRY)} />
                </ScrollView>
              </>
            )}

            {/* ── Step 2: Enter key ─────────────────────────────────────── */}
            {step === "enter" && selectedEntry && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Back + title */}
                <TouchableOpacity onPress={() => setStep("pick")} style={styles.backRow}>
                  <Ionicons name="chevron-back" size={18} color={theme.brand} />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <View style={styles.providerHeading}>
                  <Text style={styles.providerHeadingIcon}>{selectedEntry.icon}</Text>
                  <Text style={styles.sheetTitle}>{selectedEntry.name}</Text>
                </View>

                {/* Console link */}
                {selectedEntry.consoleUrl ? (
                  <TouchableOpacity
                    style={styles.consoleLinkRow}
                    onPress={() => Linking.openURL(selectedEntry.consoleUrl!)}
                  >
                    <Ionicons name="open-outline" size={14} color={theme.brand} />
                    <Text style={styles.consoleLinkText}>
                      Open {selectedEntry.name} key console
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* One-time warning */}
                {selectedEntry.keyOnlyShownOnce ? (
                  <View style={styles.warningBadge}>
                    <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                    <Text style={styles.warningText}>
                      {selectedEntry.name} shows your key only once at creation. Copy it immediately before closing the browser tab.
                    </Text>
                  </View>
                ) : null}

                {/* Custom base URL */}
                {selectedEntry.id === "custom" || selectedEntry.id === "ollama" || selectedEntry.id === "bitnet" ? (
                  <>
                    <Text style={styles.label}>BASE URL</Text>
                    <TextInput
                      value={newBaseUrl}
                      onChangeText={setNewBaseUrl}
                      placeholder={selectedEntry.id === "ollama" ? "http://localhost:11434" : selectedEntry.id === "bitnet" ? "http://localhost:8080" : "https://your-server.com/v1"}
                      placeholderTextColor={theme.textTertiary}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </>
                ) : null}

                {/* Key input */}
                <Text style={styles.label}>API KEY</Text>
                <TextInput
                  ref={keyInputRef}
                  value={newKeyText}
                  onChangeText={setNewKeyText}
                  placeholder="Paste your API key here..."
                  placeholderTextColor={theme.textTertiary}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  secureTextEntry={false}
                  multiline={false}
                />
                <View style={styles.keyActions}>
                  <TouchableOpacity style={styles.keyActionBtn} onPress={openClipboard}>
                    <Ionicons name="clipboard-outline" size={15} color={theme.brand} />
                    <Text style={styles.keyActionText}>Paste</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.keyActionBtn} onPress={importFromFile}>
                    <Ionicons name="document-outline" size={15} color={theme.brand} />
                    <Text style={styles.keyActionText}>Import file</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.keyHint}>
                  Long-press the key field to access clipboard history &amp; pinned items
                </Text>

                {/* Label */}
                <Text style={styles.label}>LABEL (OPTIONAL)</Text>
                <TextInput
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder={`e.g. My ${selectedEntry.name} Key`}
                  placeholderTextColor={theme.textTertiary}
                  style={styles.input}
                />

                {/* Actions */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                  <TouchableOpacity onPress={closeAdd} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                    <Text style={styles.btnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAdd}
                    disabled={validating || !newKeyText.trim()}
                    style={[styles.btn, styles.btnPrimary, { flex: 1, opacity: validating || !newKeyText.trim() ? 0.5 : 1 }]}
                  >
                    {validating
                      ? <ActivityIndicator color="#0A0A0B" size="small" />
                      : <Text style={styles.btnPrimaryText}>Validate & Save</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Provider Row ─────────────────────────────────────────────────────────────

function ProviderRow({ entry, onPress }: { entry: ProviderEntry; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.providerRow} onPress={onPress}>
      <Text style={styles.providerIcon}>{entry.icon}</Text>
      <Text style={styles.providerName}>{entry.name}</Text>
      {entry.keyOnlyShownOnce
        ? <Text style={styles.onceBadge}>Once only</Text>
        : entry.id !== "custom"
        ? <Text style={styles.anytimeBadge}>Copy anytime</Text>
        : null}
      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    marginBottom: 8,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: "hidden",
  },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  emptyText: { color: theme.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: theme.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.brand },
  keyHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  providerIcon: { fontSize: 16 },
  keyLabel: { color: theme.textPrimary, fontSize: 14, fontWeight: "600" },
  keyMeta: { color: theme.textSecondary, fontSize: 11, marginTop: 3, fontFamily: "monospace" },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,107,107,0.08)" },
  separator: { height: 1, backgroundColor: theme.border, marginLeft: 50 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  addIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.brand, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  addText: { color: theme.brand, fontSize: 14, fontWeight: "600" },
  hint: { color: theme.textTertiary, fontSize: 11, marginHorizontal: 24, marginBottom: 24, lineHeight: 16 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30, borderWidth: 1, borderColor: theme.border, maxHeight: "92%" },
  handle: { alignSelf: "center", width: 38, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginBottom: 14 },
  sheetTitle: { color: theme.textPrimary, fontSize: 20, fontWeight: "600", marginBottom: 10 },

  sectionLabel: { color: theme.textTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6 },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border },
  providerName: { color: theme.textPrimary, fontSize: 15, fontWeight: "500", flex: 1 },
  onceBadge: { color: "#f59e0b", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(245,158,11,0.12)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  anytimeBadge: { color: "#34d399", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(52,211,153,0.12)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { color: theme.brand, fontSize: 14, fontWeight: "600" },
  providerHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  providerHeadingIcon: { fontSize: 24 },

  consoleLinkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  consoleLinkText: { color: theme.brand, fontSize: 13, fontWeight: "600", textDecorationLine: "underline" },
  warningBadge: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  warningText: { color: "#f59e0b", fontSize: 12, flex: 1, lineHeight: 17 },

  label: { color: theme.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: theme.surfaceHi, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "monospace" },
  keyActions: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 4 },
  keyActionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,176,0,0.1)", borderWidth: 1, borderColor: "rgba(255,176,0,0.25)" },
  keyActionText: { color: theme.brand, fontSize: 13, fontWeight: "600" },
  keyHint: { color: theme.textTertiary, fontSize: 11, marginTop: 6, marginBottom: 2, lineHeight: 15 },

  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: { backgroundColor: theme.surfaceHi, borderWidth: 1, borderColor: theme.border },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
