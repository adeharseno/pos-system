import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const receiptPage = readFileSync("src/app/(protected)/transactions/[id]/receipt/page.tsx", "utf8");
const printCss = readFileSync("src/app/globals.css", "utf8");

test("cash receipt presents tender and change before its dynamic payment method", () => {
  const total = receiptPage.indexOf('<dt className="receipt-total">TOTAL</dt>');
  const tender = receiptPage.indexOf('receipt-payment-total flex justify-between');
  const change = receiptPage.indexOf('>KEMBALI</dt>');
  const payment = receiptPage.indexOf('>Pembayaran</dt>');
  const status = receiptPage.indexOf('>Status</dt>');
  assert.ok(total < tender && tender < change && change < payment && payment < status);
  assert.match(receiptPage, /paymentName\(receipt\.paymentMethod\)/);
  assert.match(receiptPage, /receipt\.paymentMethod === "bpjs" \? "DITANGGUNG BPJS"/);
});

test("receipt item detail and tender rows share their corresponding headline sizes", () => {
  assert.match(printCss, /\.receipt-document \.receipt-item-title[\s\S]*?font-size: 9\.5px/);
  assert.match(printCss, /\.receipt-document \.receipt-item-detail[\s\S]*?font-size: 9\.5px/);
  assert.match(printCss, /\.receipt-document \.receipt-total,\s*\.receipt-document \.receipt-payment-total/);
});

test("80mm print CSS removes page margin and uses an explicit left-aligned box model", () => {
  assert.match(printCss, /@page \{ margin: 0; size: 80mm auto; \}/);
  assert.match(printCss, /width: 76mm !important;[\s\S]*?margin: 0 !important;[\s\S]*?padding: 1mm 2mm !important;/);
});
