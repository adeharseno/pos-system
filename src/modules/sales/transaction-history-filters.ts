export type TransactionStatus="pending_payment"|"completed"|"voided";
export type PaymentMethod="cash"|"qris";
export type HistoryFilters={q:string;payment?:PaymentMethod;status?:TransactionStatus;from?:string;to?:string;page:number;limit:number};
const date=/^\d{4}-\d{2}-\d{2}$/;
const values=<T extends string>(value:unknown,allowed:readonly T[]):T|undefined=>typeof value==="string"&&allowed.includes(value as T)?value as T:undefined;
export function parseHistoryFilters(input:Record<string,unknown>):HistoryFilters{const page=typeof input.page==="string"&&/^\d+$/.test(input.page)?Math.max(1,Math.min(Number(input.page),10000)):1;const q=typeof input.q==="string"?input.q.trim().slice(0,80):"";return{q,payment:values(input.payment,["cash","qris"]),status:values(input.status,["pending_payment","completed","voided"]),from:typeof input.from==="string"&&date.test(input.from)?input.from:undefined,to:typeof input.to==="string"&&date.test(input.to)?input.to:undefined,page,limit:20};}
export const historyStatusLabel=(status:TransactionStatus)=>status==="completed"?"Selesai":status==="pending_payment"?"Menunggu Pembayaran":"Dibatalkan";
