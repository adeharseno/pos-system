import assert from "node:assert/strict";
import test from "node:test";
import {returnBaseFromUnits,returnQuantity} from "./return-quantity";
test("no prior return maps sold units",()=>assert.deepEqual(returnQuantity({purchasedBase:20,returnedBase:0,conversionToBase:10}),{remainingBase:20,exact:true,purchasedUnits:2,returnedUnits:0,remainingUnits:2}));
test("partial and aggregated returns map correctly",()=>{const returned=[3,7].reduce((a,b)=>a+b,0);assert.equal(returnQuantity({purchasedBase:20,returnedBase:returned,conversionToBase:10}).remainingUnits,1);});
test("fully returned item has zero remaining",()=>assert.equal(returnQuantity({purchasedBase:20,returnedBase:20,conversionToBase:10}).remainingBase,0));
test("invalid and non-divisible quantities are safe",()=>{assert.throws(()=>returnQuantity({purchasedBase:10,returnedBase:11,conversionToBase:10}));assert.throws(()=>returnQuantity({purchasedBase:10,returnedBase:0,conversionToBase:0}));const value=returnQuantity({purchasedBase:20,returnedBase:5,conversionToBase:10});assert.equal(value.exact,false);assert.equal(value.returnedUnits,null);});
test("payload conversion stays in base units",()=>assert.equal(returnBaseFromUnits(2,10),20));
