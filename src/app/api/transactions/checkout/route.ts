import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { checkout } from "@/modules/sales/application/sales-service";
import { arrayField, numberField, objectValue, optionalNumberField, optionalStringField, readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function POST(request:Request){return executeApi(async()=>{
  const employee=await requirePosOperator(); const body=await readJsonObject(request);
  const method=stringField(body,"payment_method"); if(method!=="cash"&&method!=="qris")throw new TypeError("invalid payment method");
  const prescriptionRaw=body.prescription; const prescription=prescriptionRaw===undefined?undefined:objectValue(prescriptionRaw,"prescription");
  return checkout({employeeId:employee.employeeId,cashDrawerSessionId:stringField(body,"cash_drawer_session_id"),paymentMethod:method,
    cashReceived:optionalNumberField(body,"cash_received"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productUnitId:stringField(item,"product_unit_id"),quantity:numberField(item,"quantity")};}),
    prescription:prescription?{prescriptionNumber:optionalStringField(prescription,"prescription_number"),doctorName:stringField(prescription,"doctor_name"),patientName:stringField(prescription,"patient_name"),photoUrl:optionalStringField(prescription,"photo_url")}:undefined});
},201);}
