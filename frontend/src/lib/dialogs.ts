import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 * - Native (Android/iOS): uses Alert.alert with destructive option.
 * - Web: uses window.confirm (since react-native-web's Alert.alert is a no-op).
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel: string = "Delete"
) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-undef
    const ok = typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
