"use server";
import { redirect } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { closeCashDrawer,openCashDrawer } from "./application/cash-drawer-service";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
function balance(formData:FormData,key:string){return Number(String(formData.get(key)??""));}
export async function openCashDrawerAction(formData:FormData):Promise<never>{try{const employee=await requirePosOperator();await openCashDrawer({employeeId:employee.employeeId,openingBalance:balance(formData,"opening_balance")});}catch(error){if(error instanceof PosDomainError)redirect(`/cash-drawer?error=${error.code}`);redirect("/cash-drawer?error=INVALID_OPENING_BALANCE");}redirect("/cashier");}
export async function closeCashDrawerAction(formData:FormData):Promise<never>{let result;try{const employee=await requirePosOperator();result=await closeCashDrawer({employeeId:employee.employeeId,sessionId:String(formData.get("session_id")??""),actualClosingCash:balance(formData,"actual_closing_cash")});}catch(error){if(error instanceof PosDomainError)redirect(`/cash-drawer?error=${error.code}`);redirect("/cash-drawer?error=INVALID_CLOSING_BALANCE");}redirect(`/cash-drawer?closed=1&expected=${result.expectedCash}&actual=${result.actualCash}&difference=${result.difference}`);}
