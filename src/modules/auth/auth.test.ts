import assert from "node:assert/strict";
import test from "node:test";

import { AuthApplicationError } from "./errors";
import { getCurrentEmployeeWith, logoutWith, requireEmployeeWith, requireRoleWith, withEmployeeIdentity, type AuthDependencies } from "./application/auth-policy";
import type { EmployeeRecord } from "./types";

const user={id:"11111111-1111-4111-8111-111111111111",email:"cashier@example.test"};
const activeCashier:EmployeeRecord={employeeId:"22222222-2222-4222-8222-222222222222",name:"Cashier",role:"kasir",isActive:true};
const activeAdmin:EmployeeRecord={employeeId:"33333333-3333-4333-8333-333333333333",name:"Admin",role:"owner_admin",isActive:true};

function dependencies(currentUser= user as typeof user|null,employee=activeCashier as EmployeeRecord|null):AuthDependencies {
  return {getUser:async()=>currentUser,findEmployee:async()=>employee,signOut:async()=>{}};
}

async function expectCode(operation:()=>Promise<unknown>,code:string){
  await assert.rejects(operation,(error:unknown)=>error instanceof AuthApplicationError&&error.code===code);
}

test("unauthenticated request is rejected",async()=>expectCode(()=>requireEmployeeWith(dependencies(null)),"UNAUTHENTICATED"));
test("authenticated user without employee mapping is rejected",async()=>expectCode(()=>requireEmployeeWith(dependencies(user,null)),"EMPLOYEE_NOT_FOUND"));
test("inactive employee is rejected",async()=>expectCode(()=>requireEmployeeWith(dependencies(user,{...activeCashier,isActive:false})),"EMPLOYEE_INACTIVE"));
test("active cashier resolves to a minimal employee session",async()=>assert.deepEqual(await getCurrentEmployeeWith(dependencies()),{employeeId:activeCashier.employeeId,authUserId:user.id,name:"Cashier",role:"kasir"}));
test("active admin satisfies admin role guard",async()=>assert.equal((await requireRoleWith(["owner_admin"],dependencies(user,activeAdmin))).role,"owner_admin"));
test("cashier cannot satisfy admin role guard",async()=>expectCode(()=>requireRoleWith(["owner_admin"],dependencies()),"FORBIDDEN"));
test("logout removes subsequent session access",async()=>{
  let currentUser:typeof user|null=user;
  const deps:AuthDependencies={getUser:async()=>currentUser,findEmployee:async()=>activeCashier,signOut:async()=>{currentUser=null;}};
  assert.equal((await requireEmployeeWith(deps)).employeeId,activeCashier.employeeId);
  await logoutWith(deps);
  await expectCode(()=>requireEmployeeWith(deps),"UNAUTHENTICATED");
});
test("employee identity is injected from the server session and overrides caller data",()=>{
  const session={employeeId:activeCashier.employeeId,authUserId:user.id,name:"Cashier",role:"kasir" as const};
  const result=withEmployeeIdentity(session,{employeeId:"forged",transactionId:"tx"});
  assert.equal(result.employeeId,activeCashier.employeeId);
});
