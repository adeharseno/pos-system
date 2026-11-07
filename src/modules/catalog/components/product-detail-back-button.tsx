"use client";

import { useRouter } from "next/navigation";
import { isSafeProductReturnReferrer } from "../product-detail-navigation";

export function ProductDetailBackButton() {
  const router = useRouter();
  return <button type="button" className="inline-flex min-h-12 items-center rounded-lg px-1 text-base font-semibold text-brand-600 hover:underline" onClick={() => {
    if (isSafeProductReturnReferrer(document.referrer, window.location.origin)) router.back();
    else router.push("/products");
  }}>← Kembali ke daftar</button>;
}
