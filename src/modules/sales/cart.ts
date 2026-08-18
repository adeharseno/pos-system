import { PosInputError } from "@/modules/shared/validation/input";
export interface CartCandidate{productId:string;productName:string;productUnitId:string;unitLabel:string;quantity?:number;conversionToBase:number;displayedUnitPrice:number;requiresPrescription:boolean}
export interface CartLine extends Omit<CartCandidate,"quantity">{quantity:number}
const valid=(quantity:number)=>{if(!Number.isSafeInteger(quantity)||quantity<=0)throw new PosInputError("quantity must be a positive integer");return quantity;};
export function addCartItem(cart:CartLine[],candidate:CartCandidate){const quantity=valid(candidate.quantity??1);const index=cart.findIndex(line=>line.productId===candidate.productId&&line.productUnitId===candidate.productUnitId);if(index<0)return[...cart,{...candidate,quantity}];return cart.map((line,i)=>i===index?{...line,quantity:line.quantity+quantity}:line);}
export function setCartQuantity(cart:CartLine[],productId:string,productUnitId:string,quantity:number){valid(quantity);return cart.map(line=>line.productId===productId&&line.productUnitId===productUnitId?{...line,quantity}:line);}
export const increaseCartQuantity=(cart:CartLine[],productId:string,unitId:string)=>{const line=cart.find(item=>item.productId===productId&&item.productUnitId===unitId);if(!line)throw new PosInputError("cart line not found");return setCartQuantity(cart,productId,unitId,line.quantity+1);};
export const decreaseCartQuantity=(cart:CartLine[],productId:string,unitId:string)=>{const line=cart.find(item=>item.productId===productId&&item.productUnitId===unitId);if(!line)throw new PosInputError("cart line not found");return setCartQuantity(cart,productId,unitId,Math.max(1,line.quantity-1));};
export const removeCartItem=(cart:CartLine[],productId:string,unitId:string)=>cart.filter(line=>line.productId!==productId||line.productUnitId!==unitId);
export const cartSubtotalPreview=(cart:CartLine[])=>cart.reduce((total,line)=>total+line.displayedUnitPrice*line.quantity,0);
