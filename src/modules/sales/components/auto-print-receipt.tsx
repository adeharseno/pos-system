"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const receiptPrintErrorMessage = "Struk belum dapat dibuka untuk dicetak. Periksa izin print browser lalu coba lagi.";
const RECEIPT_READY_SELECTOR = '.receipt-document[data-receipt-ready="true"]';

export function receiptDocumentReady(document: Document | null | undefined) {
  return Boolean(document?.querySelector(RECEIPT_READY_SELECTOR));
}

const nextFrame = (view: Window) => new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));

async function waitForVisualResources(document: Document) {
  await document.fonts?.ready;
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(`${RECEIPT_READY_SELECTOR} img`));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
    if (image.decode) await image.decode().catch(() => undefined);
  }));
  if (document.defaultView) {
    await nextFrame(document.defaultView);
    await nextFrame(document.defaultView);
  }
}

function waitForReceiptDocument(document: Document, signal: AbortSignal) {
  if (receiptDocumentReady(document)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { observer.disconnect(); reject(new DOMException("Receipt readiness cancelled", "AbortError")); };
    const observer = new MutationObserver(() => {
      if (!receiptDocumentReady(document)) return;
      observer.disconnect();
      signal.removeEventListener("abort", abort);
      resolve();
    });
    signal.addEventListener("abort", abort, { once: true });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  });
}

export function AutoPrintReceipt({ transactionId, label = "Cetak Struk", autoPrint = true }: { transactionId: string; label?: string; autoPrint?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const autoAttempted = useRef(false);
  const printInProgress = useRef(false);
  const readiness = useRef<Promise<void> | null>(null);
  const readinessAbort = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = `/transactions/${encodeURIComponent(transactionId)}/receipt`;

  const prepare = useCallback((document: Document) => {
    readinessAbort.current?.abort();
    const controller = new AbortController();
    readinessAbort.current = controller;
    setReady(false);
    const pending = waitForReceiptDocument(document, controller.signal)
      .then(() => waitForVisualResources(document))
      .then(() => { if (!controller.signal.aborted) setReady(true); });
    readiness.current = pending;
    return pending;
  }, []);

  const print = useCallback(async (automatic = false) => {
    if (printInProgress.current || (automatic && autoAttempted.current)) return;
    if (automatic) autoAttempted.current = true;
    printInProgress.current = true;
    try {
      await readiness.current;
      const receipt = frame.current?.contentWindow;
      if (!receipt || !receiptDocumentReady(receipt.document)) throw new Error("Receipt is not ready");
      receipt.focus();
      receipt.print();
      setError(null);
    } catch (printError) {
      if (printError instanceof DOMException && printError.name === "AbortError") return;
      setError(automatic ? `Permintaan cetak otomatis belum dapat diproses browser. Gunakan tombol ${label}.` : receiptPrintErrorMessage);
    } finally {
      printInProgress.current = false;
    }
  }, [label]);

  useEffect(() => {
    if (!ready || !autoPrint) return;
    const frameId = window.requestAnimationFrame(() => void print(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [autoPrint, print, ready]);
  useEffect(() => () => readinessAbort.current?.abort(), []);

  return <>
    <iframe ref={frame} title={label} aria-hidden="true" tabIndex={-1} className="pointer-events-none fixed h-0 w-0 border-0" src={src}
      onError={() => { readinessAbort.current?.abort(); setReady(false); setError(receiptPrintErrorMessage); }}
      onLoad={(event) => {
        const document = event.currentTarget.contentWindow?.document;
        if (!document) { setError(receiptPrintErrorMessage); return; }
        void prepare(document).catch((prepareError) => {
          if (!(prepareError instanceof DOMException && prepareError.name === "AbortError")) setError(receiptPrintErrorMessage);
        });
      }} />
    <button type="button" data-receipt-print-action="true" className="flex min-h-12 items-center justify-center rounded-[7px] border border-[var(--border-strong)] px-4 text-sm font-semibold disabled:opacity-50" disabled={!ready} onClick={() => void print(false)}>{error ? "Coba Cetak Lagi" : label}</button>
    {error ? <p role="alert" className="rounded-[7px] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">{error}</p> : null}
  </>;
}
