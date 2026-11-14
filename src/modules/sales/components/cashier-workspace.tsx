"use client";
import { useEffect,useRef,useState } from "react";
import type { CashierProductResult } from "@/modules/catalog/types";
import { CartIcon } from "@/modules/ui/icons";
import { addCartItem,cartSubtotalPreview,decreaseCartQuantity,increaseCartQuantity,type CartLine } from "../cart";
import { consumeCashierKeyboardAction, isEditableKeyboardTarget } from "../cashier-keyboard";
import { clearPersistedPendingCheckout, reconcileCartWithAvailability, type ProductAvailability } from "../checkout-reliability";
import type { CheckoutResult, PaymentMethod } from "../types";
import { CartPanel } from "./cart-panel";
import { CheckoutPanel } from "./checkout-panel";
import { CheckoutSuccess } from "./checkout-success";
import { ProductSearch } from "./product-search";

export function CashierWorkspace(){
  const[query,setQuery]=useState("");const[scanFeedback,setScanFeedback]=useState<string|null>(null);const[scanning,setScanning]=useState(false);const[products,setProducts]=useState<CashierProductResult[]>([]);const[cart,setCart]=useState<CartLine[]>([]);const[loading,setLoading]=useState(false);const[error,setError]=useState(false);const[retry,setRetry]=useState(0);const[cartOpen,setCartOpen]=useState(false);const[checkoutOpen,setCheckoutOpen]=useState(false);const[success,setSuccess]=useState<{result:CheckoutResult&{cashReceived?:number};method:PaymentMethod}|null>(null);const searchSequence=useRef(0);const addLock=useRef(false);const pendingQuantityFocus=useRef<string|null>(null);
  useEffect(()=>{const normalized=query.trim();if(!normalized)return;const sequence=++searchSequence.current;const controller=new AbortController();const timer=setTimeout(async()=>{setLoading(true);setError(false);try{const response=await fetch(`/api/products?q=${encodeURIComponent(normalized)}`,{signal:controller.signal,cache:"no-store"});const payload=await response.json() as {ok:boolean;data?:CashierProductResult[]};if(!response.ok||!payload.ok)throw new Error("search failed");if(sequence===searchSequence.current)setProducts(payload.data??[]);}catch{if(!controller.signal.aborted&&sequence===searchSequence.current){setError(true);setProducts([]);}}finally{if(!controller.signal.aborted&&sequence===searchSequence.current)setLoading(false);}},350);return()=>{clearTimeout(timer);controller.abort();};},[query,retry]);
  useEffect(()=>{if(!cartOpen)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;}},[cartOpen]);
  const add=(product:CashierProductResult,unit:CashierProductResult["units"][number])=>{if(addLock.current)return false;addLock.current=true;try{const reconciled=reconcileCartWithAvailability(cart,[{productId:product.id,availableStockBase:product.availableStockBase}]);if(reconciled.message){setCart(reconciled.cart);setScanFeedback(`Stok diperbarui: ${reconciled.message}.`);return false;}const next=addCartItem(cart,{productId:product.id,productName:product.name,productUnitId:unit.id,unitLabel:unit.label,conversionToBase:unit.conversionToBase,displayedUnitPrice:unit.displayedUnitPrice,requiresPrescription:product.requiresPrescription,availableStockBase:product.availableStockBase});setCart(next);setScanFeedback(null);pendingQuantityFocus.current=unit.id;if(window.matchMedia("(max-width: 1023px)").matches)setCartOpen(true);return true;}catch(error){setScanFeedback(error instanceof Error?error.message:"Jumlah tidak valid.");return false;}finally{requestAnimationFrame(()=>{addLock.current=false;});}};
  const changeQuery=(value:string)=>{setQuery(value);if(!value.trim()){setProducts([]);setLoading(false);setError(false);}};
  const scan=async()=>{const barcode=query.trim();if(!barcode||scanning||checkoutOpen||success)return;setScanning(true);setScanFeedback(null);try{const response=await fetch(`/api/products?barcode=${encodeURIComponent(barcode)}`,{cache:"no-store"});const payload=await response.json() as {ok:boolean;data?:{inactive:boolean;product?:CashierProductResult;unitId?:string}|null};if(!response.ok||!payload.ok)throw new Error();if(!payload.data)return;if(payload.data.inactive){setScanFeedback("Produk ditemukan tetapi tidak aktif untuk penjualan.");return;}const product=payload.data.product;const unit=product?.units.find(value=>value.id===payload.data?.unitId);if(!product||!unit||product.availableStockBase<=0){setScanFeedback("Stok produk tidak tersedia");return;}if(add(product,unit)){setScanFeedback(`Ditambahkan: ${product.name} · ${unit.label}`);setQuery("");setProducts([]);}}catch{setScanFeedback("Barcode tidak ditemukan");}finally{setScanning(false);}};
  const refreshStock=async(showFeedback=false)=>{const ids=[...new Set(cart.map(line=>line.productId))];const response=await fetch(`/api/products/availability?ids=${encodeURIComponent(ids.join(","))}`,{cache:"no-store"});const payload=await response.json() as {ok:boolean;data?:ProductAvailability[]};if(!response.ok||!payload.ok||!payload.data){const message="Stok berubah atau tidak mencukupi. Muat ulang pencarian sebelum mencoba lagi.";if(showFeedback)setScanFeedback(message);return message;}const reconciled=reconcileCartWithAvailability(cart,payload.data);setCart(current=>reconcileCartWithAvailability(current,payload.data!).cart);const stock=new Map(payload.data.map(row=>[row.productId,row.availableStockBase]));setProducts(current=>current.map(product=>stock.has(product.id)?{...product,availableStockBase:stock.get(product.id)!}:product));const message=reconciled.message?`Stok diperbarui: ${reconciled.message}. Periksa kembali keranjang.`:"Stok berubah atau tidak mencukupi. Periksa kembali keranjang.";if(showFeedback&&reconciled.message)setScanFeedback(message);return message;};
  const count=cart.reduce((total,line)=>total+line.quantity,0);const subtotal=cartSubtotalPreview(cart);
  const[bpjsOnlyMode,setBpjsOnlyMode]=useState(false);
  const activeCartIndex=useRef(-1);
  const review=()=>{if(cart.length){setBpjsOnlyMode(false);setCartOpen(false);setCheckoutOpen(true);}};
  const reviewBpjs=()=>{setBpjsOnlyMode(true);setCartOpen(false);setCheckoutOpen(true);};
  const closeCheckout=()=>{setCheckoutOpen(false);setBpjsOnlyMode(false);};
  const immediateCompleted=(result:CheckoutResult&{cashReceived?:number},method:PaymentMethod)=>{setCheckoutOpen(false);setBpjsOnlyMode(false);setSuccess({result,method});};
  const newSale=()=>{clearPersistedPendingCheckout();setCart([]);setSuccess(null);setBpjsOnlyMode(false);setQuery("");setProducts([]);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('input[placeholder="Cari nama produk, SKU, atau scan barcode..."]')?.focus());};
  useEffect(()=>{const unitId=pendingQuantityFocus.current;if(!unitId)return;const inputs=Array.from(document.querySelectorAll<HTMLInputElement>(`[data-cart-unit-id="${unitId}"]`));const input=inputs.find(element=>element.getClientRects().length>0);if(!input)return;pendingQuantityFocus.current=null;input.focus();input.select();},[cart,cartOpen]);
  useEffect(()=>{
    if(checkoutOpen||success)return;
    const focusCart=(index:number)=>{
      if(!cart.length)return;
      activeCartIndex.current=Math.max(0,Math.min(cart.length-1,index));
      const candidates=Array.from(document.querySelectorAll<HTMLInputElement>(`[data-cart-qty-index="${activeCartIndex.current}"]`));
      const visible=candidates.find(element=>element.getClientRects().length>0);
      if(!visible&&window.matchMedia("(max-width: 1023px)").matches){setCartOpen(true);requestAnimationFrame(()=>{const input=Array.from(document.querySelectorAll<HTMLInputElement>(`[data-cart-qty-index="${activeCartIndex.current}"]`)).find(element=>element.getClientRects().length>0);input?.focus();input?.select();});return;}
      const input=visible??candidates[0];input?.focus();input?.select();
    };
    const handle=(event:KeyboardEvent)=>{
      if(isEditableKeyboardTarget(event.target)&&(event.target as HTMLElement).hasAttribute("data-cart-qty-index")&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&(event.key==="/"||event.key==="?")){event.preventDefault();document.querySelector<HTMLInputElement>("#cashier-product-search")?.focus();return;}
      const action=consumeCashierKeyboardAction(event,"cashier",isEditableKeyboardTarget(event.target));
      if(!action)return;
      if(action==="focus-search")document.querySelector<HTMLInputElement>("#cashier-product-search")?.focus();
      else if(action==="cart-edit-last")focusCart(cart.length-1);
      else if(action==="cart-previous")focusCart((activeCartIndex.current<0?cart.length:activeCartIndex.current)-1);
      else if(action==="cart-next")focusCart(activeCartIndex.current<0?0:activeCartIndex.current+1);
      else if(action==="cart-increase"||action==="cart-decrease"){
        const index=activeCartIndex.current<0?cart.length-1:activeCartIndex.current;const line=cart[index];if(!line)return;
        try{setCart(action==="cart-increase"?increaseCartQuantity(cart,line.productId,line.productUnitId):decreaseCartQuantity(cart,line.productId,line.productUnitId));setScanFeedback(null);}catch(error){setScanFeedback(error instanceof Error?error.message:"Jumlah tidak valid.");}
      }else if(action==="open-checkout"&&cart.length){setBpjsOnlyMode(false);setCartOpen(false);setCheckoutOpen(true);}
      else if(action==="open-bpjs-checkout"){setBpjsOnlyMode(true);setCartOpen(false);setCheckoutOpen(true);}
    };
    document.addEventListener("keydown",handle);
    return()=>document.removeEventListener("keydown",handle);
  },[cart,checkoutOpen,success]);
  return <>
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 pb-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0"><div className="flex min-h-0 min-w-0 flex-col">{scanFeedback?<p role="status" className="mb-3 text-sm font-medium">{scanFeedback}</p>:null}<ProductSearch onSubmit={scan} query={query} onQueryChange={changeQuery} products={products} loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)} onAdd={add}/></div><div className="hidden min-h-0 lg:block"><CartPanel cart={cart} onChange={setCart} onError={setScanFeedback} onQuantityFocus={()=>void refreshStock(true)} onReview={review} onReviewBpjs={reviewBpjs}/></div></div>
    <div className="fixed inset-x-3 bottom-3 z-30 lg:hidden"><button className="flex min-h-14 w-full items-center justify-between rounded-[9px] bg-zinc-950 px-4 text-left text-white shadow-lg" onClick={()=>setCartOpen(true)}><span className="flex items-center gap-3"><CartIcon/><span><strong className="block text-sm">{count} barang</strong><span className="tabular block text-xs text-zinc-300">Rp {subtotal.toLocaleString("id-ID")}</span></span></span><span className="text-sm font-semibold">Lihat Keranjang</span></button></div>
    {cartOpen?<div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Tutup keranjang" className="absolute inset-0 bg-zinc-950/35" onClick={()=>setCartOpen(false)}/><div className="absolute inset-x-0 bottom-0 h-[min(88dvh,760px)] overflow-hidden rounded-t-xl bg-white shadow-2xl md:left-auto md:right-0 md:h-full md:w-[420px] md:rounded-none"><CartPanel cart={cart} onChange={setCart} onError={setScanFeedback} onQuantityFocus={()=>void refreshStock(true)} onClose={()=>setCartOpen(false)} onReview={review} onReviewBpjs={reviewBpjs} mobile/></div></div>:null}
    {checkoutOpen?<CheckoutPanel cart={cart} estimatedTotal={subtotal} isBpjsOnly={bpjsOnlyMode} onClose={closeCheckout} onImmediateSuccess={immediateCompleted} onInsufficientStock={refreshStock}/>:null}
    {success?<CheckoutSuccess result={success.result} paymentMethod={success.method} onNewSale={newSale}/>:null}
  </>;
}
