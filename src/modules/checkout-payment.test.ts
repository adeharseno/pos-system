import assert from "node:assert/strict";
import test from "node:test";
import type { CartLine } from "./sales/cart";
import { buildCashCheckoutPayload,canOpenCheckout,canSubmitCheckout,cartAfterCheckout,checkoutErrorMessage,previewChange,quickCashAmounts,validateCashReceived } from "./sales/checkout-ui";
import { checkoutInputFromBody } from "./sales/checkout-request";
import { formatRupiah,parseRupiahInput } from "./ui/currency";

const line:CartLine={productId:"p",productName:"Obat",productUnitId:"11111111-1111-4111-8111-111111111111",unitLabel:"Tablet",quantity:2,conversionToBase:1,displayedUnitPrice:5000,requiresPrescription:false};
test("empty cart cannot open checkout",()=>assert.equal(canOpenCheckout([]),false));
test("valid cart opens checkout",()=>assert.equal(canOpenCheckout([line]),true));
test("cash input handles rupiah and invalid values",()=>{assert.equal(parseRupiahInput("Rp 100.000"),100000);assert.equal(parseRupiahInput("abc"),null);assert.ok(validateCashReceived(null,10000));});
test("exact cash is valid",()=>assert.equal(validateCashReceived(10000,10000),null));
test("cash greater than total is valid",()=>assert.equal(validateCashReceived(20000,10000),null));
test("cash below preview is rejected",()=>assert.ok(validateCashReceived(9000,10000)));
test("preview change calculation",()=>assert.equal(previewChange(20000,12500),7500));
test("quick amounts include exact and sensible larger denominations",()=>assert.deepEqual(quickCashAmounts(87500),[87500,100000,150000,200000]));
test("processing state blocks double submit",()=>assert.equal(canSubmitCheckout("processing"),false));
test("success clears cart only after success",()=>{assert.equal(cartAfterCheckout([line],false).length,1);assert.equal(cartAfterCheckout([line],true).length,0);});
test("failed checkout preserves the same cart",()=>assert.equal(cartAfterCheckout([line],false)[0],line));
test("known stock and drawer errors are actionable",()=>{assert.match(checkoutErrorMessage("INSUFFICIENT_STOCK"),/Stok berubah/);assert.match(checkoutErrorMessage("NO_ACTIVE_CASH_DRAWER"),/Sesi kasir/);});
test("unexpected errors are sanitized",()=>assert.equal(checkoutErrorMessage("secret SQL"),"Transaksi tidak dapat diproses. Periksa pesanan dan coba kembali."));
test("browser payload excludes authority-owned fields",()=>{const payload=buildCashCheckoutPayload([line],20000);assert.equal("employee_id" in payload,false);assert.equal("cash_drawer_session_id" in payload,false);assert.equal("cash_change" in payload,false);assert.equal("product_name_snapshot" in payload,false);assert.equal("unit_name_snapshot" in payload,false);});
test("server overrides forged employee and drawer identity",()=>{const input=checkoutInputFromBody({payment_method:"cash",cash_received:20000,employee_id:"forged",cash_drawer_session_id:"forged",items:[{product_unit_id:line.productUnitId,quantity:2}]},"server-employee","server-drawer");assert.equal(input.employeeId,"server-employee");assert.equal(input.cashDrawerSessionId,"server-drawer");});
test("authoritative result can differ from preview",()=>{const preview=10000;const result={totalAmount:11000,cashChange:9000};assert.notEqual(result.totalAmount,preview);assert.equal(result.cashChange,9000);});
test("rupiah formatting is consistent",()=>assert.equal(formatRupiah(100000),"Rp 100.000"));
test("prescription payload only contains required checkout data",()=>{const payload=buildCashCheckoutPayload([{...line,requiresPrescription:true}],20000,{doctorName:"dr. A",patientName:"B"});assert.deepEqual(payload.prescription,{prescription_number:undefined,doctor_name:"dr. A",patient_name:"B"});});

