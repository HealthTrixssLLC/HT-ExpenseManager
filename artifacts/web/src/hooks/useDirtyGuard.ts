import { useEffect } from "react";

const MESSAGE = "You have unsaved changes. Leave anyway?";

export function useDirtyGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MESSAGE;
      return MESSAGE;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}

export function confirmLeaveIfDirty(isDirty: boolean): boolean {
  if (!isDirty) return true;
  return window.confirm(MESSAGE);
}
