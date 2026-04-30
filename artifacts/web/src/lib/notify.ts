import { toast } from "@/hooks/use-toast";

/** Lightweight success toast helper — keeps mutation pages terse. */
export function notifySuccess(title: string, description?: string): void {
  toast({ title, description });
}
