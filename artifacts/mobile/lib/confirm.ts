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

/**
 * Promise-based variant. Resolves true if confirmed, false otherwise.
 */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const {
      title,
      message,
      confirmText = "Confirm",
      cancelText = "Cancel",
      destructive,
    } = opts;
    if (Platform.OS === "web") {
      const text = message ? `${title}\n\n${message}` : title;
      const ok = typeof window !== "undefined" ? window.confirm(text) : false;
      resolve(ok);
      return;
    }
    Alert.alert(title, message, [
      { text: cancelText, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
