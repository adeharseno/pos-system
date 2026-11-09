"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { EyeIcon, PencilIcon, TrashIcon } from "@/modules/ui/icons";
import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { checkInvoiceDeleteEligibility } from "../invoice-input";

const emptySubscribe = () => () => {};

export interface PurchaseInvoiceActionsProps {
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    supplier_name: string;
    payments_count: number;
    total_amount: number;
    paid_amount: number;
  };
  variant?: "table" | "card";
}

export function PurchaseInvoiceActions({ invoice, variant = "table" }: PurchaseInvoiceActionsProps) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  const eligibility = checkInvoiceDeleteEligibility({
    status: invoice.status,
    paymentsCount: invoice.payments_count,
    totalPaid: invoice.paid_amount,
  });

  const editHref =
    invoice.status === "draft"
      ? `/purchase-invoices/${invoice.id}/edit`
      : `/purchase-invoices/${invoice.id}`;

  // Update floating menu position relative to viewport
  useEffect(() => {
    if (!menuOpen || !buttonRef.current) return;

    function updatePosition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 192; // 12rem = 192px
      const menuHeight = 96;
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < menuHeight + 10 && rect.top > menuHeight + 10;

      const top = showAbove ? rect.top - menuHeight - 4 : rect.bottom + 4;
      const left = Math.max(8, rect.right - menuWidth);

      setMenuStyle({
        position: "fixed",
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        width: `${menuWidth}px`,
        zIndex: 9999,
      });
    }

    updatePosition();

    function handleScrollOrResize() {
      updatePosition();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuDropdownRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (variant === "card") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/purchase-invoices/${invoice.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
          >
            <EyeIcon className="mr-2 size-4" />
            Detail
          </Link>
          <Link
            href={editHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50"
          >
            <PencilIcon className="mr-2 size-4" />
            Edit
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
        >
          <TrashIcon className="mr-2 size-4" />
          Hapus Invoice
        </button>

        <DeleteInvoiceDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number}
          supplierName={invoice.supplier_name}
          canDelete={eligibility.canDelete}
          reason={eligibility.reason}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {/* Detail Button with Eye Icon (Retained as required) */}
      <Link
        href={`/purchase-invoices/${invoice.id}`}
        aria-label={`Lihat detail invoice ${invoice.invoice_number}`}
        title="Lihat Detail"
        className="inline-flex size-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-brand-600"
      >
        <EyeIcon className="size-5" />
      </Link>

      {/* Action Menu Dropdown Trigger */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label={`Menu aksi invoice ${invoice.invoice_number}`}
        title="Menu Aksi"
        aria-expanded={menuOpen}
        className="inline-flex size-10 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="5" r="1" fill="currentColor" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Action Dropdown Menu rendered via Portal to escape table/card overflow-hidden clipping */}
      {menuOpen && isMounted
        ? createPortal(
            <div
              ref={menuDropdownRef}
              style={menuStyle}
              role="menu"
              aria-label="Menu Pilihan Aksi"
              className="rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl transition-all"
            >
              <Link
                href={editHref}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-brand-600"
              >
                <PencilIcon className="mr-2.5 size-4" />
                Edit Invoice
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
                className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
              >
                <TrashIcon className="mr-2.5 size-4" />
                Hapus Invoice
              </button>
            </div>,
            document.body
          )
        : null}

      {/* Confirmation / Info Dialog */}
      <DeleteInvoiceDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        supplierName={invoice.supplier_name}
        canDelete={eligibility.canDelete}
        reason={eligibility.reason}
      />
    </div>
  );
}
