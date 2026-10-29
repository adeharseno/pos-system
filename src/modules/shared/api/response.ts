import { NextResponse } from "next/server";

import { AuthApplicationError } from "@/modules/auth/errors";
import { PosDomainError, PosDataAccessError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError } from "@/modules/shared/validation/input";
import { EmployeeManagementError, EMPLOYEE_ERRORS } from "@/modules/auth/employee-errors";

export type ApiSuccess<T>={ok:true;data:T};
export type ApiFailure={ok:false;error:{code:string;message:string}};

const conflictCodes=new Set([
  "INSUFFICIENT_STOCK","STOCK_OPNAME_IN_PROGRESS","INVALID_TRANSACTION_STATE","TRANSACTION_ALREADY_VOIDED",
  "QRIS_ALREADY_CONFIRMED","PAID_TRANSACTION_REQUIRES_RETURN","RETURN_QUANTITY_EXCEEDED","NO_ACTIVE_CASH_DRAWER",
  "TRANSACTION_HAS_RETURNS","INVALID_REFUND_DRAWER","PHYSICAL_QUANTITY_REQUIRED","INVALID_STOCK_OPNAME_STATE",
  "CASH_DRAWER_ALREADY_OPEN","CASH_DRAWER_ALREADY_CLOSED","CATEGORY_IN_USE","SUBCATEGORY_IN_USE",
]);
const notFoundCodes=new Set(["SUPPLIER_NOT_FOUND","TRANSACTION_NOT_FOUND","STOCK_OPNAME_NOT_FOUND","STOCK_OPNAME_ITEM_NOT_FOUND","PRODUCT_NOT_FOUND","PRODUCT_UNIT_NOT_FOUND","CATEGORY_NOT_FOUND","SUBCATEGORY_NOT_FOUND","TAX_NOT_FOUND"]);

export function apiSuccess<T>(data:T,status=200){return NextResponse.json<ApiSuccess<T>>({ok:true,data},{status});}
export function apiFailure(code:string,message:string,status:number){return NextResponse.json<ApiFailure>({ok:false,error:{code,message}},{status});}

export function mapApiError(error:unknown){
  if(error instanceof EmployeeManagementError){
    const [status,message]=EMPLOYEE_ERRORS[error.code];
    return apiFailure(error.code,message,status);
  }
  if(error instanceof AuthApplicationError){
    const status=error.code==="UNAUTHENTICATED"?401:403;
    return apiFailure(error.code,status===401?"Silakan masuk untuk melanjutkan.":"Anda tidak memiliki akses untuk melakukan tindakan ini.",status);
  }
  if(error instanceof PosInputError||error instanceof SyntaxError||error instanceof TypeError)return apiFailure("INVALID_REQUEST","Data tidak sesuai. Periksa kembali isian Anda.",400);
  if(error instanceof PosDomainError){
    const status=notFoundCodes.has(error.code)?404:conflictCodes.has(error.code)?409:400;
    const messages:Partial<Record<PosDomainError["code"],string>>={SUPPLIER_NOT_FOUND:"Pemasok tidak ditemukan atau sudah dihapus.",PRODUCT_NOT_FOUND:"Produk tidak ditemukan.",PRODUCT_INACTIVE:"Produk tidak aktif.",PRODUCT_UNIT_NOT_FOUND:"Unit produk tidak ditemukan.",STOCK_OPNAME_ITEM_NOT_FOUND:"Barang dalam perhitungan stok tidak ditemukan.",CATEGORY_NOT_FOUND:"Kategori tidak ditemukan.",SUBCATEGORY_NOT_FOUND:"Subkategori tidak ditemukan.",TAX_NOT_FOUND:"Pajak tidak ditemukan.",CATEGORY_IN_USE:"Kategori masih digunakan dan tidak dapat dihapus.",SUBCATEGORY_IN_USE:"Subkategori masih digunakan dan tidak dapat dihapus.",BASE_UNIT_PROTECTED:"Unit dasar hanya dapat mengubah harga jual dan barcode.",DUPLICATE_CATEGORY:"Nama kategori sudah digunakan.",DUPLICATE_SUBCATEGORY:"Nama subkategori sudah digunakan pada kategori ini.",DUPLICATE_TAX_NAME:"Nama pajak sudah digunakan.",DUPLICATE_TAX_RATE:"Persentase pajak aktif sudah digunakan.",DUPLICATE_UNIT_NAME:"Nama unit sudah digunakan pada produk ini.",DUPLICATE_BATCH:"Batch sudah tersedia untuk produk dan tanggal kedaluwarsa tersebut.",DUPLICATE_BARCODE:"Barcode sudah digunakan oleh unit produk lain.",EXPIRED_BATCH:"Batch sudah kedaluwarsa.",INVALID_EXPIRY:"Tanggal kedaluwarsa tidak valid.",INVALID_QUANTITY:"Jumlah harus berupa bilangan bulat lebih dari 0.",INVALID_COST:"Harga modal tidak valid.",INVALID_CONVERSION:"Konversi unit harus berupa bilangan bulat lebih dari 0.",INVALID_SELLING_PRICE:"Harga jual tidak valid."};
    return apiFailure(error.code,messages[error.code]??"Tindakan tidak dapat diselesaikan. Periksa kembali data Anda.",status);
  }
  if(error instanceof PosDataAccessError)return apiFailure("DATABASE_OPERATION_FAILED","Tindakan tidak dapat diselesaikan. Silakan coba lagi.",500);
  return apiFailure("INTERNAL_ERROR","Terjadi kesalahan. Silakan coba lagi.",500);
}

export async function executeApi<T>(operation:()=>Promise<T>,successStatus=200){
  try{return apiSuccess(await operation(),successStatus);}catch(error){return mapApiError(error);}
}
