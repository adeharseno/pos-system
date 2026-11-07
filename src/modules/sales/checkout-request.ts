import { arrayField, numberField, objectValue, optionalNumberField, optionalStringField, stringField } from "@/modules/shared/api/input";
import type { CheckoutInput } from "./types";

export function checkoutInputFromBody(body:Record<string,unknown>,employeeId:string):CheckoutInput{
  const method=stringField(body,"payment_method");if(method!=="cash"&&method!=="qris")throw new TypeError("invalid payment method");
  const prescription=objectValue(body.prescription,"prescription");const category=stringField(prescription,"prescription_category");if(category!=="umum"&&category!=="bpjs")throw new TypeError("invalid prescription category");
  return{employeeId,paymentMethod:method,cashReceived:optionalNumberField(body,"cash_received"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productUnitId:stringField(item,"product_unit_id"),quantity:numberField(item,"quantity")};}),prescription:{category,prescriptionNumber:optionalStringField(prescription,"prescription_number"),patientName:optionalStringField(prescription,"patient_name"),bpjsNumber:optionalStringField(prescription,"bpjs_number"),prescriptionOrigin:optionalStringField(prescription,"prescription_origin"),prescriptionDate:optionalStringField(prescription,"prescription_date")}};
}

