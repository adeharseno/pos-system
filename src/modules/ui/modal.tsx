"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

type ModalProps = {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  open: boolean;
};

// TailAdmin rounded modal surface and backdrop, with native focus containment.
export function Modal({ children, labelledBy, onClose, open }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-transparent p-4 text-[var(--text)] backdrop:bg-gray-400/50 backdrop:backdrop-blur-sm"
    >
      <div className="pointer-events-none flex min-h-full items-center justify-center">
        <div className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-theme-lg">
          {children}
        </div>
      </div>
    </dialog>
  );
}

export function ModalHeader({ children, id, onClose }: { children: ReactNode; id: string; onClose: () => void }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6"><h2 id={id} className="pt-2 text-xl font-semibold text-gray-800">{children}</h2><button type="button" aria-label="Tutup dialog" onClick={onClose} className="inline-flex size-13 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"><CloseIcon /></button></div>;
}

export function ModalContent({ children }: { children: ReactNode }) {
  return <div className="p-5 sm:p-6">{children}</div>;
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--border)] px-5 py-4 sm:px-6">{children}</div>;
}
