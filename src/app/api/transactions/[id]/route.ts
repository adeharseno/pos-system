import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getTransaction } from "@/modules/sales/data/transaction-queries";
import { executeApi } from "@/modules/shared/api/response";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { requireUuid } from "@/modules/shared/validation/input";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){return executeApi(async()=>{await requirePosOperator();const {id}=await params;const transaction=await getTransaction(requireUuid(id,"transactionId"));if(!transaction)throw new PosDomainError("TRANSACTION_NOT_FOUND");return transaction;});}
