import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FinalizeReceivingButton } from "./components/finalize-receiving-button";
import { ReceivingCompletedSummary } from "./components/receiving-completed-summary";
import { formatReceivingAmount } from "./receiving-presentation";

const router: AppRouterInstance = { bfcacheId: "test", push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
test("confirmation amounts retain exact cents including negative and large totals", () => {
  assert.equal(formatReceivingAmount("-100.50"),"-Rp 100,50");
  assert.equal(formatReceivingAmount("9999999999999999.99"),"Rp 9.999.999.999.999.999,99");
  assert.equal(formatReceivingAmount("0.00"),"Rp 0");
});
test("finalization is disabled while unsaved edits or mutations remain", () => {
  const markup=renderToStaticMarkup(<AppRouterContext.Provider value={router}><FinalizeReceivingButton invoiceId="invoice" disabled /></AppRouterContext.Provider>);
  assert.ok(markup.includes("Selesaikan Penerimaan")); assert.ok(markup.includes('disabled=""')); assert.ok(markup.includes("Simpan atau batalkan isian barang"));
});
test("completed receiving summary contains no editing or finalization controls", () => {
  const markup=renderToStaticMarkup(<ReceivingCompletedSummary items={[]} receipts={[]} />);
  assert.ok(markup.includes("Penerimaan Selesai")); assert.ok(markup.includes("hanya dapat dilihat"));
  assert.ok(!markup.includes("<button")); assert.ok(!markup.includes("<form"));
});
