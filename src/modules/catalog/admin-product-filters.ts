export type ProductStatusFilter="active"|"inactive"|"all";
export type PrescriptionFilter="all"|"required"|"non_prescription";
export type AdminProductFilters={q:string;status:ProductStatusFilter;prescription:PrescriptionFilter;page:number;limit:number};

const choice=<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T=>typeof value==="string"&&allowed.includes(value as T)?value as T:fallback;

export function parseAdminProductFilters(input:Record<string,string|undefined>):AdminProductFilters{
  const page=typeof input.page==="string"&&/^\d+$/.test(input.page)?Math.max(1,Math.min(Number(input.page),10000)):1;
  const raw=(input.q??"").trim().slice(0,80);const q=/^[-.\p{L}\p{N}_ ]*$/u.test(raw)?raw:"";
  return {q,status:choice(input.status,["active","inactive","all"],"active"),prescription:choice(input.prescription,["all","required","non_prescription"],"all"),page,limit:20};
}
