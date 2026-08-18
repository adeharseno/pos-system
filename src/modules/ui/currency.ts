export const formatRupiah=(value:number)=>`Rp ${Math.max(0,value).toLocaleString("id-ID",{maximumFractionDigits:0})}`;
export function parseRupiahInput(value:string){const digits=value.replace(/\D/g,"");return digits?Number(digits):null;}

