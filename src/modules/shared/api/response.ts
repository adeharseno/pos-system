import { NextResponse } from "next/server";

import { AuthApplicationError } from "@/modules/auth/errors";
import { PosDomainError, PosDataAccessError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError } from "@/modules/shared/validation/input";

export type ApiSuccess<T>={ok:true;data:T};
export type ApiFailure={ok:false;error:{code:string;message:string}};

const conflictCodes=new Set([
  "INSUFFICIENT_STOCK","STOCK_OPNAME_IN_PROGRESS","INVALID_TRANSACTION_STATE","TRANSACTION_ALREADY_VOIDED",
  "QRIS_ALREADY_CONFIRMED","PAID_TRANSACTION_REQUIRES_RETURN","RETURN_QUANTITY_EXCEEDED","NO_ACTIVE_CASH_DRAWER",
  "TRANSACTION_HAS_RETURNS","INVALID_REFUND_DRAWER","PHYSICAL_QUANTITY_REQUIRED","INVALID_STOCK_OPNAME_STATE",
  "CASH_DRAWER_ALREADY_OPEN","CASH_DRAWER_ALREADY_CLOSED",
]);
const notFoundCodes=new Set(["TRANSACTION_NOT_FOUND","STOCK_OPNAME_NOT_FOUND"]);

export function apiSuccess<T>(data:T,status=200){return NextResponse.json<ApiSuccess<T>>({ok:true,data},{status});}
export function apiFailure(code:string,message:string,status:number){return NextResponse.json<ApiFailure>({ok:false,error:{code,message}},{status});}

export function mapApiError(error:unknown){
  if(error instanceof AuthApplicationError){
    const status=error.code==="UNAUTHENTICATED"?401:403;
    return apiFailure(error.code,status===401?"Authentication required":"Access denied",status);
  }
  if(error instanceof PosInputError||error instanceof SyntaxError||error instanceof TypeError)return apiFailure("INVALID_REQUEST","Request payload is invalid",400);
  if(error instanceof PosDomainError){
    const status=notFoundCodes.has(error.code)?404:conflictCodes.has(error.code)?409:400;
    return apiFailure(error.code,"The operation could not be completed",status);
  }
  if(error instanceof PosDataAccessError)return apiFailure("DATABASE_OPERATION_FAILED","The operation could not be completed",500);
  return apiFailure("INTERNAL_ERROR","An unexpected error occurred",500);
}

export async function executeApi<T>(operation:()=>Promise<T>,successStatus=200){
  try{return apiSuccess(await operation(),successStatus);}catch(error){return mapApiError(error);}
}
