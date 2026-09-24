"use client";

import { useEffect, useRef, useState } from "react";
import type { Strings } from "@/lib/dashboard/i18n";

export type ToastState = { id: number; message: string; onUndo?: () => Promise<void> | void };

// A short message at the bottom of the screen, with Undo when the action can be reversed. The
// Undo variant stays longer, since it is the whole point of being non-blocking.
export default function UndoToast({ toast, onClose, t }: { toast: ToastState; onClose: () => void; t: Strings }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => close.current(), toast.onUndo ? 15000 : 5000);
    return () => clearTimeout(id);
  }, [toast.id, toast.onUndo]);

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs text-ink shadow-lg"
    >
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); await toast.onUndo!(); }}
          className="font-semibold text-accent disabled:opacity-50"
        >
          {t.delUndo}
        </button>
      )}
      <button onClick={onClose} aria-label={t.delDismiss} className="text-ink2 hover:text-ink">&times;</button>
    </div>
  );
}
