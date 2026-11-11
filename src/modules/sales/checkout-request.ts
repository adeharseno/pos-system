import { arrayField, numberField, objectValue, optionalNumberField, optionalStringField, stringField } from "@/modules/shared/api/input";
import type { CheckoutInput } from "./types";

export function checkoutInputFromBody(body:Record<string,unknown>,employeeId:string):CheckoutInput{
  const requestedMethod=stringField(body,"payment_method");
  if(requestedMethod!=="cash"&&requestedMethod!=="qris"&&requestedMethod!=="bank_transfer"&&requestedMethod!=="bpjs"&&requestedMethod!=="tempo")throw new TypeError("invalid payment method");
  const prescription=objectValue(body.prescription,"prescription");
  const category=stringField(prescription,"prescription_category");
  if(category!=="umum"&&category!=="bpjs"&&category!=="bebas")throw new TypeError("invalid prescription category");
  if(category!=="bpjs"&&requestedMethod==="bpjs")throw new TypeError("invalid payment method for category");
  if(category==="bpjs"&&requestedMethod==="tempo")throw new TypeError("TEMPO cannot be combined with BPJS");
  const method=category==="bpjs"?"bpjs":requestedMethod;
  const rawSupplementary = body.supplementary_items;
  let supplementaryItems: CheckoutInput["supplementaryItems"];
  if (Array.isArray(rawSupplementary)) {
    supplementaryItems = rawSupplementary.map((raw, index) => {
      const item = objectValue(raw, `supplementary_items[${index}]`);
      const drugName = stringField(item, "drug_name").trim();
      if (!drugName) throw new TypeError(`supplementary_items[${index}].drug_name required`);
      const quantity = numberField(item, "quantity");
      if (!Number.isInteger(quantity) || quantity < 1) throw new TypeError(`supplementary_items[${index}].quantity invalid`);
      const unitPrice = numberField(item, "unit_price");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new TypeError(`supplementary_items[${index}].unit_price invalid`);
      return { drugName, quantity, unitPrice };
    });
  }
  const customerId = optionalStringField(body, "customer_id");
  const dueDate = optionalStringField(body, "due_date");
  return{
    requestId:typeof body.request_id==="string"?body.request_id:crypto.randomUUID(),employeeId,paymentMethod:method,
    cashReceived:category==="bpjs"?0:optionalNumberField(body,"cash_received"),
    ...(customerId !== undefined ? { customerId } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    items:arrayField(body,"items").map((raw,index)=>{const item=objectValue(raw,`items[${index}]`);return{productUnitId:stringField(item,"product_unit_id"),quantity:numberField(item,"quantity")};}),
    prescription:{category,prescriptionNumber:category==="bebas"?undefined:optionalStringField(prescription,"prescription_number"),patientName:category==="bebas"?undefined:optionalStringField(prescription,"patient_name"),bpjsNumber:category==="bpjs"?optionalStringField(prescription,"bpjs_number"):undefined,prescriptionOrigin:category==="bebas"?undefined:optionalStringField(prescription,"prescription_origin"),prescriptionDate:category==="bebas"?undefined:optionalStringField(prescription,"prescription_date")},
    ...(supplementaryItems ? { supplementaryItems } : {})
  };
}
