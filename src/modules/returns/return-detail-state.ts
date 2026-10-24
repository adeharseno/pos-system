import {type ReturnQuantity} from "./return-quantity";
export type DetailReturnState="none"|"partial"|"full";
export function detailReturnState(items:Array<ReturnQuantity & {remainingBase:number}>):DetailReturnState{if(items.every(item=>item.remainingBase===0))return"full";if(items.some(item=>item.returnedBase>0))return"partial";return"none";}
export const canStartReturn=(status:string,state:DetailReturnState)=>status==="completed"&&state!=="full";
