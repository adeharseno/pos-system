import assert from "node:assert/strict";
import test from "node:test";

import { requireResultObject, resultNumber, resultString } from "./shared/data/result";
import { mapDatabaseError, PosDataAccessError, PosDomainError } from "./shared/errors/pos-domain-error";
import { PosInputError } from "./shared/validation/input";
import { toCheckoutRpcArgs } from "./sales/rpc-contract";
import { validateCheckoutInput } from "./sales/schemas";

const employeeId="11111111-1111-4111-8111-111111111111";
const drawerId="22222222-2222-4222-8222-222222222222";
const unitId="33333333-3333-4333-8333-333333333333";

test("checkout input maps only application values into the SQL RPC contract",()=>{
  const args=toCheckoutRpcArgs({employeeId,cashDrawerSessionId:drawerId,paymentMethod:"cash",cashReceived:5000,items:[{productUnitId:unitId,quantity:2}]});
  assert.deepEqual(args,{p_employee_id:employeeId,p_cash_drawer_session_id:drawerId,p_payment_method:"cash",p_items:[{product_unit_id:unitId,quantity:2}],p_cash_received:5000,p_prescription:undefined});
  assert.equal("invoice_number" in args,false);
  assert.equal("cash_change" in args,false);
  assert.equal("batch_id" in args,false);
});

test("basic boundary validation rejects malformed input",()=>{
  assert.throws(()=>validateCheckoutInput({employeeId:"bad",cashDrawerSessionId:drawerId,paymentMethod:"cash",items:[{productUnitId:unitId,quantity:1}]}),PosInputError);
  assert.throws(()=>validateCheckoutInput({employeeId,cashDrawerSessionId:drawerId,paymentMethod:"cash",items:[{productUnitId:unitId,quantity:0}]}),PosInputError);
});

test("successful JSON RPC results are mapped with checked field types",()=>{
  const result=requireResultObject({transaction_id:employeeId,status:"completed",total_amount:1000});
  assert.equal(resultString(result,"transaction_id"),employeeId);
  assert.equal(resultString(result,"status"),"completed");
  assert.equal(resultNumber(result,"total_amount"),1000);
  assert.throws(()=>resultNumber(result,"status"),TypeError);
});

test("known PostgreSQL messages map to typed domain errors",()=>{
  const error=mapDatabaseError({code:"P0001",message:"PAID_TRANSACTION_REQUIRES_RETURN"});
  assert.ok(error instanceof PosDomainError);
  assert.equal(error.code,"PAID_TRANSACTION_REQUIRES_RETURN");
  assert.equal(error.message,"PAID_TRANSACTION_REQUIRES_RETURN");
});

test("wrapped PostgreSQL domain errors remain classifiable",()=>{
  const error=mapDatabaseError({message:"RPC failed: INSUFFICIENT_STOCK (context hidden)"});
  assert.ok(error instanceof PosDomainError);
  assert.equal(error.code,"INSUFFICIENT_STOCK");
});

test("unknown database failures become safe infrastructure errors",()=>{
  const technical={code:"XX000",message:"internal relation detail"};
  const error=mapDatabaseError(technical);
  assert.ok(error instanceof PosDataAccessError);
  assert.equal(error.publicMessage,"DATABASE_OPERATION_FAILED");
  assert.equal(error.message,"Database operation failed");
  assert.equal(error.technicalCause,technical);
});
