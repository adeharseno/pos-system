import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AutoPrintReceipt,receiptDocumentReady,receiptPrintErrorMessage } from "./sales/components/auto-print-receipt";
import { QrisPending } from "./sales/components/qris-pending";
import type { CheckoutResult } from "./sales/types";

const mockPendingResult: CheckoutResult = {
  transactionId: "22222222-2222-4222-8222-222222222222",
  invoiceNumber: "INV-20261108-0001",
  status: "pending_payment",
  subtotal: 50000,
  taxAmount: 0,
  totalAmount: 50000,
  cashChange: null,
};

test("successful checkout exposes a direct manual print action",()=>{const html=renderToStaticMarkup(<AutoPrintReceipt transactionId="11111111-1111-4111-8111-111111111111"/>);assert.match(html,/Cetak Struk/);assert.match(html,/\/transactions\/11111111-1111-4111-8111-111111111111\/receipt/);});
test("receipt readiness requires the printable receipt document",()=>{assert.equal(receiptDocumentReady(undefined),false);assert.match(receiptPrintErrorMessage,/coba lagi/i);});
test("AutoPrintReceipt supports custom label and disabling autoPrint",()=>{const html=renderToStaticMarkup(<AutoPrintReceipt transactionId="tx-custom" label="Cetak Invoice" autoPrint={false}/>);assert.match(html,/Cetak Invoice/);assert.match(html,/\/transactions\/tx-custom\/receipt/);});
test("QrisPending workflow exposes Cetak Invoice button and new tab fallback link for QRIS",()=>{const html=renderToStaticMarkup(<QrisPending result={mockPendingResult} method="qris" onCompleted={()=>{}} onVoided={()=>{}}/>);assert.match(html,/Menunggu Pembayaran QRIS/);assert.match(html,/Cetak Invoice/);assert.match(html,/Lihat \/ Buka Invoice di Tab Baru/);assert.match(html,/\/transactions\/22222222-2222-4222-8222-222222222222\/receipt/);assert.match(html,/target="_blank"/);});
test("QrisPending workflow exposes Cetak Invoice button and new tab fallback link for Bank Transfer",()=>{const html=renderToStaticMarkup(<QrisPending result={mockPendingResult} method="bank_transfer" onCompleted={()=>{}} onVoided={()=>{}}/>);assert.match(html,/Menunggu Pembayaran Transfer Bank/);assert.match(html,/Cetak Invoice/);assert.match(html,/Lihat \/ Buka Invoice di Tab Baru/);assert.match(html,/\/transactions\/22222222-2222-4222-8222-222222222222\/receipt/);});
