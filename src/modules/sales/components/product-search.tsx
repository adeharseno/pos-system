"use client";

import { cashierUnitSaleState, deduplicateCashierUnits } from "@/modules/catalog/search";
import type { CashierProductResult } from "@/modules/catalog/types";
import { formatRupiah } from "@/modules/ui/currency";
import { EmptySearchIcon, SearchIcon } from "@/modules/ui/icons";

type ProductUnit = CashierProductResult["units"][number];
type Props = { query:string; onQueryChange:(value:string)=>void; onSubmit:()=>void; products:CashierProductResult[]; loading:boolean; error:boolean; onRetry:()=>void; onAdd:(product:CashierProductResult,unit:ProductUnit)=>void };

function StockBadge({stock}:{stock:number}) {
  const label=stock<=0?"Stok habis":stock<=5?`Stok menipis · ${stock}`:`Stok tersedia · ${stock}`;
  const tone=stock<=0?"bg-[var(--danger-soft)] text-[var(--danger)]":stock<=5?"bg-[var(--warning-soft)] text-[var(--warning)]":"bg-[var(--success-soft)] text-[var(--success)]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function UnitAction({product,unit,onAdd}:{product:CashierProductResult;unit:ProductUnit;onAdd:Props["onAdd"]}) {
  const state=cashierUnitSaleState(product.availableStockBase,unit.displayedUnitPrice);
  const actionLabel=product.availableStockBase<=0?"Stok habis":unit.displayedUnitPrice<=0?"Belum bisa dijual":state.label;
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3"><div className="min-w-0">{unit.label.trim()?<p className="truncate text-xs font-medium text-[var(--text-muted)]">{unit.label}</p>:null}{unit.displayedUnitPrice>0?<p className="tabular mt-0.5 truncate text-sm font-semibold text-gray-900">{formatRupiah(unit.displayedUnitPrice)}</p>:<p className="text-sm font-medium text-[var(--danger)]">Harga belum diatur</p>}</div><button type="button" className="min-h-11 shrink-0 rounded-[7px] border border-[var(--border-strong)] px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!state.enabled} onClick={()=>onAdd(product,unit)}>{actionLabel}</button></div>;
}

function ProductCard({product,onAdd}:{product:CashierProductResult;onAdd:Props["onAdd"]}) {
  const displayUnits = deduplicateCashierUnits(product.units);
  return <article className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 transition duration-150 hover:border-[var(--border-strong)]"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="truncate text-[15px] font-semibold">{product.name}</h3><p className="mt-0.5 truncate text-xs font-medium text-[var(--text-muted)]">SKU · {product.sku}</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"><StockBadge stock={product.availableStockBase}/>{product.requiresPrescription?<span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--warning)]">Perlu resep</span>:null}</div></div>{displayUnits.length?<div className="mt-2.5 grid gap-2">{displayUnits.map(unit=><UnitAction key={unit.id} product={product} unit={unit} onAdd={onAdd}/>)}</div>:<div className="mt-2.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3"><p className="min-w-0 text-sm font-medium text-[var(--danger)]">Harga belum diatur</p><button type="button" disabled className="min-h-11 shrink-0 rounded-[7px] border border-[var(--border-strong)] px-3 text-sm font-semibold opacity-50">Belum bisa dijual</button></div>}</article>;
}

export function ProductSearch({query,onQueryChange,onSubmit,products,loading,error,onRetry,onAdd}:Props) {
  return <section aria-labelledby="product-search-title" className="flex min-h-0 min-w-0 flex-1 flex-col"><div className="mb-4 shrink-0"><h2 className="sr-only" id="product-search-title">Pencarian barang</h2><label className="relative block"><span className="sr-only">Cari nama barang, SKU, atau barcode</span><SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"/><input autoFocus className="h-12 w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-white pl-11 pr-4 text-[15px] shadow-[0_1px_2px_rgba(0,0,0,.03)] transition duration-150 placeholder:text-zinc-400 hover:border-zinc-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]" value={query} onChange={event=>onQueryChange(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();onSubmit();}}} placeholder="Cari nama produk, SKU, atau scan barcode..." /></label></div><div className="min-h-0 flex-1 overflow-y-auto">
    {loading?<div aria-label="Memuat barang" className="grid gap-3">{[1,2,3].map(item=><div className="h-28 animate-pulse rounded-[var(--radius)] border border-[var(--border)] bg-white p-4" key={item}><div className="h-4 w-1/3 rounded bg-zinc-100"/><div className="mt-3 h-3 w-1/4 rounded bg-zinc-100"/><div className="mt-5 h-8 rounded bg-zinc-100"/></div>)}</div>:null}
    {error?<div role="alert" className="grid min-h-48 place-content-center rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">!</div><h3 className="font-semibold">Barang tidak dapat dimuat</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Periksa koneksi Anda dan coba lagi.</p><button className="mx-auto mt-4 min-h-11 rounded-[7px] border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-zinc-50" onClick={onRetry}>Coba lagi</button></div>:null}
    {!loading&&!error&&!query.trim()?<div className="grid h-full min-h-52 place-content-center rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] bg-white/60 p-6 text-center"><span className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><EmptySearchIcon/></span></div>:null}
    {!loading&&!error&&query.trim()&&!products.length?<div className="grid min-h-48 place-content-center rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 text-center"><h3 className="font-semibold">Barang tidak ditemukan</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Coba nama barang atau SKU lain.</p></div>:null}
    {!loading&&!error&&products.length?<div className="grid gap-2.5">{products.map(product=><ProductCard key={product.id} product={product} onAdd={onAdd}/>)}</div>:null}
  </div></section>;
}
