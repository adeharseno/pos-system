import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { AuthApplicationError } from "@/modules/auth/errors";
import { createCustomerReturn, createSupplierReturn } from "@/modules/returns/application/returns-service";
import { arrayField, numberField, objectValue, optionalStringField, readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request:Request){return executeApi(async()=>{
  const employee=await requirePosOperator(); const body=await readJsonObject(request); const source=stringField(body,"source");
  if(source==="customer"){
    const method=stringField(body,"refund_method"); if(method!=="cash"&&method!=="qris")throw new TypeError("invalid refund method");
    return createCustomerReturn({employeeId:employee.employeeId,transactionId:stringField(body,"transaction_id"),refundMethod:method,
      cashDrawerSessionId:optionalStringField(body,"cash_drawer_session_id"),reason:stringField(body,"reason"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{transactionItemId:stringField(item,"transaction_item_id"),quantityInBase:numberField(item,"quantity_in_base")};})});
  }
  if(source==="supplier"){
    if(employee.role!=="owner_admin")throw new AuthApplicationError("FORBIDDEN");
    return createSupplierReturn({employeeId:employee.employeeId,reason:stringField(body,"reason"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productId:stringField(item,"product_id"),batchId:stringField(item,"batch_id"),quantityInBase:numberField(item,"quantity_in_base")};})});
  }
  throw new TypeError("invalid return source");
},201);}
