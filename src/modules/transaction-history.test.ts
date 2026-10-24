import test from "node:test";
import assert from "node:assert/strict";
import { historyStatusLabel,parseHistoryFilters } from "./sales/transaction-history-filters";

test("history filters validate enums, pagination, and invoice search",()=>{const result=parseHistoryFilters({q:" INV-01 ",payment:"cash",status:"completed",page:"2",from:"2026-10-24",to:"2026-10-25"});assert.deepEqual(result,{q:"INV-01",payment:"cash",status:"completed",page:2,limit:20,from:"2026-10-24",to:"2026-10-25"});});
test("history filters ignore malformed values",()=>{const result=parseHistoryFilters({payment:"wire",status:"paid",page:"-2",from:"24/10/2026"});assert.equal(result.payment,undefined);assert.equal(result.status,undefined);assert.equal(result.page,1);assert.equal(result.from,undefined);});
test("history status labels remain explicit",()=>{assert.equal(historyStatusLabel("completed"),"Selesai");assert.equal(historyStatusLabel("pending_payment"),"Menunggu Pembayaran");assert.equal(historyStatusLabel("voided"),"Dibatalkan");});
