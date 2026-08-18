import { PosInputError } from "@/modules/shared/validation/input";

export type InputObject=Record<string,unknown>;
export async function readJsonObject(request:Request):Promise<InputObject>{
  const contentType=request.headers.get("content-type")??"";
  if(!contentType.toLowerCase().includes("application/json"))throw new PosInputError("application/json required");
  let value:unknown; try{value=await request.json();}catch{throw new PosInputError("invalid JSON");}
  if(value===null||Array.isArray(value)||typeof value!=="object")throw new PosInputError("object body required");
  return value as InputObject;
}
export function stringField(value:InputObject,key:string){if(typeof value[key]!=="string")throw new PosInputError(`${key} must be a string`);return value[key] as string;}
export function optionalStringField(value:InputObject,key:string){const field=value[key];if(field===undefined||field===null)return undefined;if(typeof field!=="string")throw new PosInputError(`${key} must be a string`);return field;}
export function numberField(value:InputObject,key:string){if(typeof value[key]!=="number")throw new PosInputError(`${key} must be a number`);return value[key] as number;}
export function optionalNumberField(value:InputObject,key:string){const field=value[key];if(field===undefined||field===null)return undefined;if(typeof field!=="number")throw new PosInputError(`${key} must be a number`);return field;}
export function arrayField(value:InputObject,key:string){if(!Array.isArray(value[key]))throw new PosInputError(`${key} must be an array`);return value[key] as unknown[];}
export function objectValue(value:unknown,key:string):InputObject{if(value===null||Array.isArray(value)||typeof value!=="object")throw new PosInputError(`${key} must be an object`);return value as InputObject;}
