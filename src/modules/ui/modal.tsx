"use client";

import { useEffect, type ReactNode } from "react";

type ModalProps = {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  open: boolean;
};

export function Modal({ children, labelledBy, onClose, open }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ children, id, onClose }: { children: ReactNode; id: string; onClose: () => void }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6"><h2 id={id} className="text-lg font-semibold">{children}</h2><button type="button" aria-label="Tutup dialog" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-[var(--radius)] text-xl leading-none text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]">×</button></div>;
}

export function ModalContent({ children }: { children: ReactNode }) {
  return <div className="p-5 sm:p-6">{children}</div>;
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--border)] px-5 py-4 sm:px-6">{children}</div>;
}
