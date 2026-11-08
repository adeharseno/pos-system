"use client";
import { useRef,useState } from "react";

export const receiptPrintErrorMessage="Struk belum dapat dibuka untuk dicetak. Periksa izin print browser lalu coba lagi.";
export function receiptDocumentReady(document:Document|null|undefined){return Boolean(document?.querySelector(".receipt-document"));}

export function AutoPrintReceipt({transactionId,label="Cetak Struk",autoPrint=true}:{transactionId:string;label?:string;autoPrint?:boolean}){
  const frame=useRef<HTMLIFrameElement>(null);const autoAttempted=useRef(false);const[ready,setReady]=useState(false);const[error,setError]=useState<string|null>(null);const src=`/transactions/${encodeURIComponent(transactionId)}/receipt`;
  const print=(automatic=false)=>{const receipt=frame.current?.contentWindow;try{if(!receipt||!receiptDocumentReady(receipt.document)){setError(receiptPrintErrorMessage);return;}receipt.focus();receipt.print();setError(null);}catch{setError(automatic?`Cetak otomatis diblokir browser. Gunakan tombol ${label}.`:receiptPrintErrorMessage);}};
  return <><iframe ref={frame} title={label} aria-hidden="true" tabIndex={-1} className="pointer-events-none fixed h-0 w-0 border-0" src={src} onError={()=>{setReady(false);setError(receiptPrintErrorMessage);}} onLoad={event=>{if(!receiptDocumentReady(event.currentTarget.contentWindow?.document)){setReady(false);setError(receiptPrintErrorMessage);return;}setReady(true);if(autoPrint&&!autoAttempted.current){autoAttempted.current=true;print(true);}}}/><button type="button" className="flex min-h-12 items-center justify-center rounded-[7px] border border-[var(--border-strong)] px-4 text-sm font-semibold disabled:opacity-50" disabled={!ready} onClick={()=>print(false)}>{error?"Coba Cetak Lagi":label}</button>{error?<p role="alert" className="rounded-[7px] bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">{error}</p>:null}</>;
}
