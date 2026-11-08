import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AutoPrintReceipt,receiptDocumentReady,receiptPrintErrorMessage } from "./sales/components/auto-print-receipt";

test("successful checkout exposes a direct manual print action",()=>{const html=renderToStaticMarkup(<AutoPrintReceipt transactionId="11111111-1111-4111-8111-111111111111"/>);assert.match(html,/Cetak Struk/);assert.match(html,/\/transactions\/11111111-1111-4111-8111-111111111111\/receipt/);});
test("receipt readiness requires the printable receipt document",()=>{assert.equal(receiptDocumentReady(undefined),false);assert.match(receiptPrintErrorMessage,/coba lagi/i);});
