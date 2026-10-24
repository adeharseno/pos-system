import {notFound,redirect} from "next/navigation";
import {requirePosOperator} from "@/modules/auth/application/auth-service";
import {getCustomerReturns,getTransaction} from "@/modules/sales/data/transaction-queries";
import {requireUuid} from "@/modules/shared/validation/input";
import {CustomerReturnForm} from "@/modules/returns/components/customer-return-form";
import {returnQuantity} from "@/modules/returns/return-quantity";
type ReturnItem={transaction_item_id:string;quantity_in_base:number};
type ReturnRecord={return_items:ReturnItem[]|null};
type TransactionItem={id:string;product_name_snapshot:string;unit_name_snapshot:string;quantity_in_unit:number;quantity_in_base:number;conversion_to_base_snapshot:number;total_amount:number};
export default async function Page({params}:{params:Promise<{id:string}>}){await requirePosOperator();const{id}=await params;let tx:string;try{tx=requireUuid(id,"id")}catch{notFound()}const row=await getTransaction(tx);if(!row)notFound();if(row.status!=="completed")redirect(`/transactions/${tx}`);const returns=await getCustomerReturns(tx) as ReturnRecord[];const returned=new Map<string,number>();for(const record of returns)for(const item of record.return_items??[])returned.set(item.transaction_item_id,(returned.get(item.transaction_item_id)??0)+item.quantity_in_base);const items=(row.transaction_items as TransactionItem[]).map(item=>{const returnedBase=returned.get(item.id)??0;return{id:item.id,name:item.product_name_snapshot,unit:item.unit_name_snapshot,price:item.total_amount,conversion:item.conversion_to_base_snapshot,...returnQuantity({purchasedBase:item.quantity_in_base,returnedBase,conversionToBase:item.conversion_to_base_snapshot})};});return <CustomerReturnForm transaction={{id:row.id,invoice:row.invoice_number,payment:row.payment_method,items}}/>}
