"use client";
import { useState, type KeyboardEvent } from "react";
import { cartSubtotalPreview,decreaseCartQuantity,increaseCartQuantity,removeCartItem,setCartQuantity,type CartLine } from "../cart";
import { CartIcon,CloseIcon } from "@/modules/ui/icons";
import { formatRupiah } from "@/modules/ui/currency";

const rupiah=formatRupiah;

/**
 * Quantity box for one cart line. It keeps a local text draft so the field can
 * be emptied while typing (Backspace/Delete) instead of snapping back to 1.
 * The draft is committed on blur/Enter, and arrow keys step the quantity.
 */
function QuantityInput({value,onChange,label,id}:{value:number;onChange:(value:number)=>void;label:string;id:string}){
  const [draft,setDraft]=useState(String(value));
  const [focused,setFocused]=useState(false);
  const [lastValue,setLastValue]=useState(value);
  // Sync with outside changes (stepper buttons, cart updates) without an effect.
  if(!focused&&value!==lastValue){setLastValue(value);setDraft(String(value));}
  const commit=()=>{
    const parsed=Number.parseInt(draft,10);
    const next=Number.isSafeInteger(parsed)&&parsed>0?parsed:value;
    setDraft(String(next));
    if(next!==value)onChange(next);
  };
  const step=(delta:number)=>{
    const parsed=Number.parseInt(draft,10);
    const base=Number.isSafeInteger(parsed)&&parsed>0?parsed:value;
    const next=Math.max(1,base+delta);
    setDraft(String(next));
    onChange(next);
  };
  const keyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==="ArrowUp"){event.preventDefault();step(1);}
    else if(event.key==="ArrowDown"){event.preventDefault();step(-1);}
    else if(event.key==="Enter"){event.preventDefault();commit();}
  };
  return <input id={id} aria-label={label} className="tabular qty-input-field h-full w-11 border-x border-[var(--border)] text-center text-sm font-semibold outline-none" inputMode="numeric" pattern="[0-9]*" type="text" value={draft}
    onFocus={event=>{setFocused(true);event.currentTarget.select();}}
    onBlur={()=>{setFocused(false);commit();}}
    onChange={event=>{
      const raw=event.target.value.replace(/\D/g,"");
      setDraft(raw);
      const parsed=Number.parseInt(raw,10);
      if(Number.isSafeInteger(parsed)&&parsed>0)onChange(parsed);
    }}
    onKeyDown={keyDown} />;
}

export function CartPanel({
  cart,
  onChange,
  onClose,
  onReview,
  onReviewBpjs,
  mobile = false,
}: {
  cart: CartLine[];
  onChange: (cart: CartLine[]) => void;
  onClose?: () => void;
  onReview: () => void;
  onReviewBpjs?: () => void;
  mobile?: boolean;
}) {
  const subtotal = cartSubtotalPreview(cart);
  const count = cart.reduce((total, line) => total + line.quantity, 0);
  return (
    <aside
      aria-label="Pesanan saat ini"
      className={
        mobile
          ? "flex h-full flex-col bg-white"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white"
      }
    >
      <header className="flex min-h-16 items-center justify-between border-b border-[var(--border)] px-4">
        <div>
          <h2 className="font-semibold">Pesanan Saat Ini</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {count} {"barang"}
          </p>
        </div>
        {onClose ? (
          <button aria-label="Tutup keranjang" className="grid size-11 place-items-center rounded-[7px] hover:bg-zinc-100" onClick={onClose}>
            <CloseIcon />
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {!cart.length ? (
          <div className="grid h-full min-h-64 place-content-center text-center">
            <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-zinc-100 text-zinc-500">
              <CartIcon />
            </span>
            <h3 className="font-semibold">Keranjang masih kosong</h3>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {cart.map((line) => (
              <article className="py-4" key={`${line.productId}:${line.productUnitId}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{line.productName}</h3>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{line.unitLabel}</p>
                    {line.requiresPrescription ? (
                      <p className="mt-2 inline-block rounded-full bg-[var(--warning-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--warning)]">
                        Perlu resep
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="min-h-11 shrink-0 px-1 text-xs font-semibold text-[var(--danger)] hover:underline"
                    onClick={() => onChange(removeCartItem(cart, line.productId, line.productUnitId))}
                  >
                    Hapus
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex h-11 items-center overflow-hidden rounded-[7px] border border-[var(--border-strong)]">
                    <button
                      aria-label={`Kurangi ${line.productName} ${line.unitLabel}`}
                      className="grid size-11 place-items-center text-lg hover:bg-zinc-50"
                      onClick={() => onChange(decreaseCartQuantity(cart, line.productId, line.productUnitId))}
                    >
                      −
                    </button>
                    <label className="sr-only" htmlFor={`qty-${line.productUnitId}`}>
                      Jumlah {line.productName} {line.unitLabel}
                    </label>
                    <QuantityInput
                      key={`${line.productId}:${line.productUnitId}`}
                      id={`qty-${line.productUnitId}`}
                      label={`Jumlah ${line.productName} ${line.unitLabel}`}
                      value={line.quantity}
                      onChange={(value) => onChange(setCartQuantity(cart, line.productId, line.productUnitId, value))}
                    />
                    <button
                      aria-label={`Tambah ${line.productName} ${line.unitLabel}`}
                      className="grid size-11 place-items-center text-lg hover:bg-zinc-50"
                      onClick={() => onChange(increaseCartQuantity(cart, line.productId, line.productUnitId))}
                    >
                      +
                    </button>
                  </div>
                  <p className="tabular text-sm font-semibold">{rupiah(line.displayedUnitPrice * line.quantity)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface-subtle)] p-4">
        <div className="flex items-end justify-between">
          <p className="text-sm font-semibold">Total</p>
          <strong className="tabular text-xl tracking-tight">{rupiah(subtotal)}</strong>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="flex min-h-[52px] h-[52px] w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-4 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-600)] active:opacity-90 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
            disabled={!cart.length}
            onClick={onReview}
          >
            Pesan
          </button>
          <button
            type="button"
            className="flex min-h-[42px] h-[42px] w-full items-center justify-center gap-2 rounded-[9px] border border-[var(--border-strong)] bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900 active:bg-zinc-100"
            onClick={onReviewBpjs}
          >
            <svg className="size-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.5h2m-6 4h10m-8 4h6m-9-6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10Z" />
            </svg>
            <span>Pesanan via BPJS</span>
          </button>
        </div>
      </footer>
    </aside>
  );
}
