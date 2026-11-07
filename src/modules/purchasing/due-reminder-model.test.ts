import assert from "node:assert/strict";
import test from "node:test";
import { dueReminderLabel, parsePurchaseDueReminders } from "./due-reminder-model";

test("due reminder labels cover seven days, today, and overdue",()=>{
  assert.equal(dueReminderLabel(7),"7 hari lagi");
  assert.equal(dueReminderLabel(0),"Jatuh tempo hari ini");
  assert.equal(dueReminderLabel(-3),"Terlambat 3 hari");
});
test("due reminder parser preserves positive outstanding balance",()=>{
  const rows=parsePurchaseDueReminders([{id:"i",invoiceNumber:"INV",supplier:"Supplier",dueDate:"2026-11-07",outstanding:750,daysRemaining:0}]);
  assert.equal(rows[0].outstanding,750);
  assert.throws(()=>parsePurchaseDueReminders([{...rows[0],outstanding:0}]));
});
