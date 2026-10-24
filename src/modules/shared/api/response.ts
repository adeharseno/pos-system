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
const notFoundCodes=new Set(["TRANSACTION_NOT_FOUND","STOCK_OPNAME_NOT_FOUND","PRODUCT_NOT_FOUND","PRODUCT_UNIT_NOT_FOUND"]);

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
    const messages:Partial<Record<PosDomainError["code"],string>>={PRODUCT_NOT_FOUND:"Produk tidak ditemukan.",PRODUCT_UNIT_NOT_FOUND:"Unit produk tidak ditemukan.",BASE_UNIT_PROTECTED:"Unit dasar hanya dapat mengubah harga jual dan barcode.",DUPLICATE_UNIT_NAME:"Nama unit sudah digunakan pada produk ini.",DUPLICATE_BARCODE:"Barcode sudah digunakan oleh unit produk lain.",INVALID_CONVERSION:"Konversi unit harus berupa bilangan bulat lebih dari 0.",INVALID_SELLING_PRICE:"Harga jual tidak valid."};
    return apiFailure(error.code,messages[error.code]??"The operation could not be completed",status);
  }
  if(error instanceof PosDataAccessError)return apiFailure("DATABASE_OPERATION_FAILED","The operation could not be completed",500);
  return apiFailure("INTERNAL_ERROR","An unexpected error occurred",500);
}

export async function executeApi<T>(operation:()=>Promise<T>,successStatus=200){
  try{return apiSuccess(await operation(),successStatus);}catch(error){return mapApiError(error);}
}
