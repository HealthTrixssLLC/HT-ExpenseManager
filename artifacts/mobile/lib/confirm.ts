import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 * - Native: uses React Native's Alert.alert with destructive/cancel buttons.
 * - Web: uses window.confirm (Alert.alert is a no-op on RN web).
 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}): void {
  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive,
    onConfirm,
    onCancel,
  } = opts;
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof window !== "undefined" && window.confirm(text)) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel", onPress: onCancel },
    {
      text: confirmLabel,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}
