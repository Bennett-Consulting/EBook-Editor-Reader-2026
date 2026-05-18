/**
 * AI Provider Settings — Add, validate, and manage API keys.
 *
 * Supports: OpenAI, Google Gemini, Anthropic, Groq, Ollama, Custom.
 * Auto-detects provider from key prefix. Discovers models on validation.
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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";
import { AIProvider, SavedAIKey } from "../lib/types";
import {
  getAIKeys,
  saveAIKey,
  deleteAIKey,
  getActiveAIKeyId,
  setActiveAIKeyId,
} from "../lib/storage";
import {
  detectProvider,
  maskKey,
  getProviderConfig,
  getAllProviderConfigs,
  validateKey,
} from "../lib/aiGateway";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function AIProviderSettings() {
  const [keys, setKeys] = useState<SavedAIKey[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKeyText, setNewKeyText] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [detectedProvider, setDetectedProvider] = useState<AIProvider | null>(null);
  const [manualProvider, setManualProvider] = useState<AIProvider | null>(null);
  const [validating, setValidating] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const keyInputRef = useRef<any>(null);

  const load = useCallback(async () => {
    const [savedKeys, active] = await Promise.all([
      getAIKeys(),
      getActiveAIKeyId(),
    ]);
    setKeys(savedKeys);
    setActiveId(active);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-detect provider as user types key
  useEffect(() => {
    if (newKeyText.trim().length >= 4) {
      const detected = detectProvider(newKeyText.trim());
      setDetectedProvider(detected);
      if (detected !== "custom") {
        setManualProvider(null); // Clear manual if auto-detect works
      }
    } else {
      setDetectedProvider(null);
    }
  }, [newKeyText]);

  const effectiveProvider = manualProvider || detectedProvider;

  const openClipboard = async () => {
    // Try to paste the current clipboard item first
    const text = await Clipboard.getStringAsync();
    if (text?.trim()) {
      setNewKeyText(text.trim());
    }
    // Focus the field so the user can long-press for full clipboard history & pinned items
    keyInputRef.current?.focus();
  };

  const importFromFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", ".txt", ".key"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const key = text.trim().split(/\s+/)[0]; // first word/line only
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

    const provider = effectiveProvider || "custom";
    const config = getProviderConfig(provider);

    setValidating(true);
    const result = await validateKey(
      provider,
      key,
      provider === "ollama" || provider === "custom" ? newBaseUrl || undefined : undefined
    );
    setValidating(false);

    const label =
      newLabel.trim() ||
      `${config.name}${result.modelCount ? ` (${result.modelCount} models)` : ""}`;

    const savedKey: SavedAIKey = {
      id: makeId(),
      provider,
      apiKey: key,
      label,
      customBaseUrl:
        provider === "ollama" || provider === "custom" ? newBaseUrl || undefined : undefined,
      addedAt: new Date().toISOString(),
      lastValidated: result.valid ? new Date().toISOString() : undefined,
      modelCount: result.modelCount,
    };

    await saveAIKey(savedKey);

    // Auto-set as active if it's the first key or validation passed
    const currentKeys = await getAIKeys();
    if (currentKeys.length === 1 || (result.valid && !activeId)) {
      await setActiveAIKeyId(savedKey.id);
    }

    if (!result.valid) {
      Alert.alert(
        "Key saved with warning",
        `Saved but validation returned: ${result.error || "unknown error"}. The key may still work — check for typos.`
      );
    }

    // Reset form
    setNewKeyText("");
    setNewLabel("");
    setNewBaseUrl("");
    setDetectedProvider(null);
    setManualProvider(null);
    setAddOpen(false);
    await load();
  };

  const handleSetActive = async (id: string) => {
    await setActiveAIKeyId(id);
    setActiveId(id);
  };

  const handleDelete = (k: SavedAIKey) => {
    Alert.alert(
      `Remove ${k.label}?`,
      `This will delete the ${getProviderConfig(k.provider).name} key from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteAIKey(k.id);
            await load();
          },
        },
      ]
    );
  };

  const allProviders = getAllProviderConfigs();

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
            const config = getProviderConfig(k.provider);
            const isActive = activeId === k.id;
            return (
              <View key={k.id}>
                <TouchableOpacity
                  style={styles.keyRow}
                  onPress={() => handleSetActive(k.id)}
                  onLongPress={() => handleDelete(k)}
                >
                  <View
                    style={[
                      styles.radio,
                      isActive && styles.radioActive,
                    ]}
                  >
                    {isActive && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.keyHeader}>
                      <Text style={styles.providerIcon}>{config.icon}</Text>
                      <Text
                        style={[
                          styles.keyLabel,
                          isActive && { color: theme.brand },
                        ]}
                        numberOfLines={1}
                      >
                        {k.label}
                      </Text>
                    </View>
                    <Text style={styles.keyMeta}>
                      {maskKey(k.apiKey)}
                      {k.modelCount ? ` · ${k.modelCount} models` : ""}
                      {k.lastValidated ? " · ✓ verified" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(k)}
                    hitSlop={10}
                    style={styles.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
                  </TouchableOpacity>
                </TouchableOpacity>
                <View style={styles.separator} />
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.addRow} onPress={() => setAddOpen(true)}>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={18} color={theme.brand} />
          </View>
          <Text style={styles.addText}>Add API key</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Keys are stored locally on this device only. They are never sent anywhere
        except directly to the AI provider you choose.
      </Text>

      {/* Add Key Modal */}
      <Modal
        visible={addOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setAddOpen(false)}
        >
          <Pressable style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add AI Provider</Text>

            {/* Provider detection badge */}
            {effectiveProvider && effectiveProvider !== "custom" && (
              <View style={styles.detectedBadge}>
                <Text style={styles.detectedIcon}>
                  {getProviderConfig(effectiveProvider).icon}
                </Text>
                <Text style={styles.detectedText}>
                  Detected: {getProviderConfig(effectiveProvider).name}
                </Text>
                <Ionicons name="checkmark-circle" size={16} color="#34d399" />
              </View>
            )}

            {/* Console link */}
            {effectiveProvider && getProviderConfig(effectiveProvider).consoleUrl ? (
              <TouchableOpacity
                style={styles.consoleLinkRow}
                onPress={() => Linking.openURL(getProviderConfig(effectiveProvider!).consoleUrl!)}
              >
                <Ionicons name="open-outline" size={14} color={theme.brand} />
                <Text style={styles.consoleLinkText}>
                  Open {getProviderConfig(effectiveProvider).name} key console
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Anthropic one-time warning */}
            {effectiveProvider && getProviderConfig(effectiveProvider).keyOnlyShownOnce ? (
              <View style={styles.warningBadge}>
                <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                <Text style={styles.warningText}>
                  Anthropic shows your key only once when created. Copy it immediately before closing the browser.
                </Text>
              </View>
            ) : null}

            {/* API Key input */}
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
                <Text style={styles.keyActionText}>Clipboard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.keyActionBtn} onPress={importFromFile}>
                <Ionicons name="document-outline" size={15} color={theme.brand} />
                <Text style={styles.keyActionText}>Import from file</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.keyHint}>
              Long-press the field above to choose from clipboard history &amp; pinned items
            </Text>

            {/* Manual provider selector (if auto-detect returns custom) */}
            {(detectedProvider === "custom" || detectedProvider === null) &&
              newKeyText.trim().length > 0 && (
                <View>
                  <Text style={styles.label}>PROVIDER</Text>
                  <TouchableOpacity
                    style={styles.providerSelect}
                    onPress={() => setProviderPickerOpen(true)}
                  >
                    <Text style={styles.providerSelectText}>
                      {manualProvider
                        ? `${getProviderConfig(manualProvider).icon} ${getProviderConfig(manualProvider).name}`
                        : "Tap to select provider..."}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}

            {/* Base URL for custom/ollama */}
            {(effectiveProvider === "custom" || effectiveProvider === "ollama") && (
              <View>
                <Text style={styles.label}>BASE URL</Text>
                <TextInput
                  value={newBaseUrl}
                  onChangeText={setNewBaseUrl}
                  placeholder={
                    effectiveProvider === "ollama"
                      ? "http://localhost:11434"
                      : "https://your-server.com/v1"
                  }
                  placeholderTextColor={theme.textTertiary}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            {/* Optional label */}
            <Text style={styles.label}>LABEL (OPTIONAL)</Text>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="e.g. My OpenAI Key"
              placeholderTextColor={theme.textTertiary}
              style={styles.input}
            />

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setAddOpen(false);
                  setNewKeyText("");
                  setNewLabel("");
                  setNewBaseUrl("");
                  setDetectedProvider(null);
                  setManualProvider(null);
                }}
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={validating || !newKeyText.trim()}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { flex: 1, opacity: validating || !newKeyText.trim() ? 0.5 : 1 },
                ]}
              >
                {validating ? (
                  <ActivityIndicator color="#0A0A0B" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>
                    Validate & Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Provider Picker Modal */}
      <Modal
        visible={providerPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProviderPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setProviderPickerOpen(false)}
        >
          <Pressable style={styles.pickerSheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Select Provider</Text>
            <ScrollView>
              {(Object.entries(allProviders) as [AIProvider, any][]).map(
                ([key, config]) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.pickerRow}
                    onPress={() => {
                      setManualProvider(key);
                      setProviderPickerOpen(false);
                    }}
                  >
                    <Text style={styles.providerIcon}>{config.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{config.name}</Text>
                      <Text style={styles.pickerHint}>
                        Key format: {config.keyPlaceholder}
                      </Text>
                    </View>
                    {manualProvider === key && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={theme.brand}
                      />
                    )}
                  </TouchableOpacity>
                )
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

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
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  emptyText: {
    color: theme.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: theme.brand,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.brand,
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  providerIcon: {
    fontSize: 16,
  },
  keyLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  keyMeta: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 3,
    fontFamily: "monospace",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,107,107,0.08)",
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
    marginLeft: 50,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.brand,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    color: theme.brand,
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    color: theme.textTertiary,
    fontSize: 11,
    marginHorizontal: 24,
    marginBottom: 24,
    lineHeight: 16,
  },

  // Modal styles
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: "90%",
  },
  pickerSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: "70%",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: {
    color: theme.textPrimary,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  label: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: theme.surfaceHi,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "monospace",
  },
  keyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  keyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,176,0,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,176,0,0.25)",
  },
  keyActionText: {
    color: theme.brand,
    fontSize: 13,
    fontWeight: "600",
  },
  keyHint: {
    color: theme.textTertiary,
    fontSize: 11,
    marginTop: 6,
    marginBottom: 2,
    lineHeight: 15,
  },
  consoleLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  consoleLinkText: {
    color: theme.brand,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  warningText: {
    color: "#f59e0b",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  detectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(52,211,153,0.1)",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.3)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  detectedIcon: {
    fontSize: 18,
  },
  detectedText: {
    color: "#34d399",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  providerSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  providerSelectText: {
    color: theme.textPrimary,
    fontSize: 15,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  pickerName: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  pickerHint: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontFamily: "monospace",
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: theme.brand },
  btnPrimaryText: { color: "#0A0A0B", fontWeight: "700", fontSize: 15 },
  btnGhost: {
    backgroundColor: theme.surfaceHi,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnGhostText: { color: theme.textPrimary, fontWeight: "600", fontSize: 15 },
});
