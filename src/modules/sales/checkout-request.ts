import { arrayField, numberField, objectValue, optionalNumberField, optionalStringField, stringField } from "@/modules/shared/api/input";
import type { CheckoutInput } from "./types";

export function checkoutInputFromBody(body:Record<string,unknown>,employeeId:string):CheckoutInput{
  const requestedMethod=stringField(body,"payment_method");if(requestedMethod!=="cash"&&requestedMethod!=="qris"&&requestedMethod!=="bank_transfer"&&requestedMethod!=="bpjs")throw new TypeError("invalid payment method");
  const prescription=objectValue(body.prescription,"prescription");const category=stringField(prescription,"prescription_category");if(category!=="umum"&&category!=="bpjs"&&category!=="bebas")throw new TypeError("invalid prescription category");
  if(category!=="bpjs"&&requestedMethod==="bpjs")throw new TypeError("invalid payment method for category");
  const method=category==="bpjs"?"bpjs":requestedMethod;
  return{employeeId,paymentMethod:method,cashReceived:category==="bpjs"?0:optionalNumberField(body,"cash_received"),items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productUnitId:stringField(item,"product_unit_id"),quantity:numberField(item,"quantity")};}),prescription:{category,prescriptionNumber:category==="bebas"?undefined:optionalStringField(prescription,"prescription_number"),patientName:category==="bebas"?undefined:optionalStringField(prescription,"patient_name"),bpjsNumber:category==="bpjs"?optionalStringField(prescription,"bpjs_number"):undefined,prescriptionOrigin:category==="bebas"?undefined:optionalStringField(prescription,"prescription_origin"),prescriptionDate:category==="bebas"?undefined:optionalStringField(prescription,"prescription_date")}};
}

