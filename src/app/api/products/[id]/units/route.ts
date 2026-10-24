import {requireRole} from "@/modules/auth/application/auth-service";
import {addSellingUnit} from "@/modules/catalog/application/add-selling-unit";
import {executeApi} from "@/modules/shared/api/response";
import {PosInputError,requireUuid} from "@/modules/shared/validation/input";
import {PosDomainError} from "@/modules/shared/errors/pos-domain-error";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{await requireRole(["owner_admin"]);const {id}=await params;const body=await request.json() as Record<string,unknown>;const unitName=typeof body.unit_name==="string"?body.unit_name.trim():"";const barcode=typeof body.barcode==="string"?body.barcode.trim()||null:null;const conversion=Number(body.conversion_to_base);const price=Number(body.selling_price);if(!unitName)throw new PosInputError("invalid unit");if(!Number.isSafeInteger(conversion)||conversion<=0)throw new PosDomainError("INVALID_CONVERSION");if(!Number.isFinite(price)||price<0)throw new PosDomainError("INVALID_SELLING_PRICE");return addSellingUnit({productId:requireUuid(id,"productId"),unitName,conversionToBase:conversion,sellingPrice:price,barcode});},201);}
