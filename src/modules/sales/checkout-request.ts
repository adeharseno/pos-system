import { arrayField, numberField, objectValue, optionalNumberField, optionalStringField, stringField } from "@/modules/shared/api/input";
import type { CheckoutInput } from "./types";

export function checkoutInputFromBody(body:Record<string,unknown>,employeeId:string,cashDrawerSessionId:string):CheckoutInput{
  const method=stringField(body,"payment_method");if(method!=="cash"&&method!=="qris")throw new TypeError("invalid payment method");
  const prescriptionRaw=body.prescription;const prescription=prescriptionRaw===undefined?undefined:objectValue(prescriptionRaw,"prescription");
  return{employeeId,cashDrawerSessionId,paymentMethod:method,cashReceived:optionalNumberField(body,"cash_received"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productUnitId:stringField(item,"product_unit_id"),quantity:numberField(item,"quantity")};}),prescription:prescription?{prescriptionNumber:optionalStringField(prescription,"prescription_number"),doctorName:stringField(prescription,"doctor_name"),patientName:stringField(prescription,"patient_name"),photoUrl:optionalStringField(prescription,"photo_url")}:undefined};
}

