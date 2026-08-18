import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptViewModel,formatReceiptDate,receiptStatusLabel,type ReceiptTransactionRow } from "./sales/receipt";
import { formatRupiah } from "./ui/currency";
import { requireRoleWith,type AuthDependencies } from "./auth/application/auth-policy";
import { AuthApplicationError } from "./auth/errors";
import type { EmployeeRecord } from "./auth/types";

const base:ReceiptTransactionRow={id:"tx",invoice_number:"INV-1",created_at:"2026-08-18T06:42:00.000Z",subtotal:10000,tax_amount:1000,total_amount:11000,payment_method:"cash",cash_received:20000,cash_change:9000,status:"completed",employees:{full_name:"Ayu"},transaction_items:[{quantity_in_unit:2,unit_price:5000,total_amount:11000,products:{name:"Paracetamol"},product_units:{unit_name:"Tablet"}}]};
test("cash receipt maps authoritative financial values",()=>{const model=buildReceiptViewModel(base);assert.equal(model.total,11000);assert.equal(model.cashReceived,20000);assert.equal(model.cashChange,9000);});
test("receipt item maps quantity unit price and stored line total",()=>assert.deepEqual(buildReceiptViewModel(base).items[0],{productName:"Paracetamol",unitName:"Tablet",quantity:2,unitPrice:5000,lineTotal:11000}));
test("completed QRIS receipt has no cash fields",()=>{const model=buildReceiptViewModel({...base,payment_method:"qris",cash_received:null,cash_change:null});assert.equal(model.paymentMethod,"qris");assert.equal("cashReceived" in model,false);assert.equal(receiptStatusLabel(model.status),"LUNAS");});
test("pending QRIS is explicitly non-final",()=>assert.equal(receiptStatusLabel("pending_payment"),"PEMBAYARAN BELUM DIKONFIRMASI"));
test("voided transaction is explicitly marked",()=>assert.equal(receiptStatusLabel("voided"),"VOID / DIBATALKAN"));
test("cashier and invoice come from stored read model",()=>{const model=buildReceiptViewModel(base);assert.equal(model.cashierName,"Ayu");assert.equal(model.invoiceNumber,"INV-1");});
test("Asia Jakarta receipt date formatting is stable",()=>{const value=formatReceiptDate(base.created_at);assert.match(value,/18/);assert.match(value,/13[.:]42/);});
test("receipt reuses shared Rupiah formatter",()=>assert.equal(formatRupiah(buildReceiptViewModel(base).total),"Rp 11.000"));
test("receipt view model exposes no batch allocation internals",()=>assert.equal(JSON.stringify(buildReceiptViewModel(base)).includes("batch"),false));
const user={id:"auth"};const employee=(role:EmployeeRecord["role"]):EmployeeRecord=>({employeeId:"employee",name:"User",role,isActive:true});const deps=(role:EmployeeRecord["role"]):AuthDependencies=>({getUser:async()=>user,findEmployee:async()=>employee(role),signOut:async()=>{}});
test("cashier may access receipt policy",async()=>assert.equal((await requireRoleWith(["owner_admin","kasir"],deps("kasir"))).role,"kasir"));
test("owner admin may access receipt policy",async()=>assert.equal((await requireRoleWith(["owner_admin","kasir"],deps("owner_admin"))).role,"owner_admin"));
test("staf may not access receipt policy",async()=>assert.rejects(()=>requireRoleWith(["owner_admin","kasir"],deps("staf")),(error:unknown)=>error instanceof AuthApplicationError&&error.code==="FORBIDDEN"));
test("receipt data reload is independent of cart state",()=>assert.equal(buildReceiptViewModel({...base}).transactionId,"tx"));

