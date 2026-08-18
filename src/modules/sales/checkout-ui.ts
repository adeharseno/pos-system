import type { CartLine } from "./cart";
import type { CheckoutResult } from "./types";

export type CheckoutStage="idle"|"review"|"processing"|"success"|"error"|"uncertain";
export interface CheckoutUiState{stage:CheckoutStage;result?:CheckoutResult&{cashReceived:number};error?:string}
export const initialCheckoutState:CheckoutUiState={stage:"idle"};
export const canOpenCheckout=(cart:CartLine[])=>cart.length>0;
export const canSubmitCheckout=(stage:CheckoutStage)=>stage==="review"||stage==="error";
export const cartAfterCheckout=(cart:CartLine[],succeeded:boolean)=>succeeded?[]:cart;
export function validateCashReceived(value:number|null,estimatedTotal:number){if(value===null||!Number.isFinite(value)||value<0)return"Masukkan jumlah uang yang diterima.";if(value<estimatedTotal)return"Uang diterima kurang dari total perkiraan.";return null;}
export const previewChange=(cashReceived:number|null,total:number)=>cashReceived===null?0:Math.max(0,cashReceived-total);
export function quickCashAmounts(total:number){if(total<=0)return[];const denominations=[50000,100000,150000,200000,500000];return [total,...denominations.filter(value=>value>total)].filter((value,index,all)=>all.indexOf(value)===index).slice(0,4);}
export function buildCashCheckoutPayload(cart:CartLine[],cashReceived:number,prescription?:{prescriptionNumber?:string;doctorName:string;patientName:string}){return{payment_method:"cash" as const,cash_received:cashReceived,items:cart.map(line=>({product_unit_id:line.productUnitId,quantity:line.quantity})),...(prescription?{prescription:{prescription_number:prescription.prescriptionNumber,doctor_name:prescription.doctorName,patient_name:prescription.patientName}}:{})};}
export function buildQrisCheckoutPayload(cart:CartLine[],prescription?:{prescriptionNumber?:string;doctorName:string;patientName:string}){return{payment_method:"qris" as const,items:cart.map(line=>({product_unit_id:line.productUnitId,quantity:line.quantity})),...(prescription?{prescription:{prescription_number:prescription.prescriptionNumber,doctor_name:prescription.doctorName,patient_name:prescription.patientName}}:{})};}
export const qrisActionPayload=(reason:string)=>({reason:reason.trim()});
export const canVoidQris=(status:string)=>status==="pending_payment";
export const qrisConfirmUrl=(transactionId:string)=>`/api/transactions/${transactionId}/confirm-payment`;
export const qrisVoidUrl=(transactionId:string)=>`/api/transactions/${transactionId}/void`;
export const transactionStatusUrl=(transactionId:string)=>`/api/transactions/${transactionId}`;
const errors:Record<string,string>={INSUFFICIENT_STOCK:"Stok berubah atau tidak mencukupi. Periksa kembali jumlah barang.",NO_ACTIVE_CASH_DRAWER:"Sesi kasir sudah tidak aktif. Mulai sesi kasir kembali.",STOCK_OPNAME_IN_PROGRESS:"Stok sedang dalam proses opname dan belum dapat dijual.",INVALID_PRODUCT_UNIT:"Unit produk tidak lagi valid. Hapus item dan pilih kembali.",INVALID_BATCH:"Data stok berubah. Periksa kembali pesanan.",INSUFFICIENT_CASH:"Uang diterima kurang dari total transaksi aktual.",PRESCRIPTION_REQUIRED:"Lengkapi informasi resep sebelum melanjutkan.",QRIS_ALREADY_CONFIRMED:"Pembayaran QRIS sudah dikonfirmasi.",PAID_TRANSACTION_REQUIRES_RETURN:"QRIS yang sudah dibayar tidak dapat dibatalkan. Gunakan proses retur/refund.",INVALID_TRANSACTION_STATE:"Status transaksi sudah berubah. Periksa status terbaru.",TRANSACTION_NOT_FOUND:"Transaksi tidak ditemukan."};
export const checkoutErrorMessage=(code:string)=>errors[code]??"Transaksi tidak dapat diproses. Periksa pesanan dan coba kembali.";
