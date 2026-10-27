"use client";

import { useState, type KeyboardEvent } from "react";
import type { ChartPoint } from "./dashboard-model";

// Keep exact amounts from the server; only chart geometry is calculated here.
export function MonthlySalesChart({ points }: { points: ChartPoint[] }) {
  const [selected, setSelected] = useState(() => Math.max(0, points.findIndex(point => point.count > 0)));
  if (!points.some(point => point.count > 0)) return <p className="rounded-xl bg-gray-50 px-6 py-16 text-center text-base text-gray-700">Belum ada transaksi selesai.</p>;
  const active = Math.min(selected, points.length - 1);
  const point = points[active];
  const maximum = Math.max(1, ...points.map(item => item.value));
  const left = 90, right = 790, top = 24, bottom = 245;
  const step = (right - left) / points.length;
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => bottom - (value / maximum) * (bottom - top);

  function navigate(event: KeyboardEvent<SVGGElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = Math.min(points.length - 1, index + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = points.length - 1;
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); return; }
    else return;
    event.preventDefault();
    setSelected(next);
    event.currentTarget.ownerSVGElement?.querySelector<SVGGElement>(`[data-point="${next}"]`)?.focus();
  }

  return <div>
    <div aria-live="polite" aria-atomic="true" className="mb-5 flex flex-wrap items-baseline justify-between gap-3 rounded-xl bg-brand-50 p-4 text-base">
      <p className="font-medium text-gray-800">{point.label}</p>
      <p className="text-xl font-semibold text-gray-900 tabular">{point.display}</p>
    </div>
    <div className="overflow-x-auto pb-2">
      <svg viewBox="0 0 820 295" className="w-full min-w-[680px]" role="group" aria-label="Grafik penjualan bulanan">
        {[0, 0.5, 1].map(fraction => <g key={fraction} aria-hidden="true">
          <line x1={left} x2={right} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#d0d5dd" strokeDasharray="4 4" />
          <text x={left - 14} y={y(maximum * fraction) + 5} textAnchor="end" fontSize="20" fill="#475467">{new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(maximum * fraction)}</text>
        </g>)}
        {points.map((item, index) => <g key={item.label} data-point={index} role="button" tabIndex={index === active ? 0 : -1}
          aria-label={`${item.label}: ${item.display}`} aria-pressed={index === active}
          onFocus={() => setSelected(index)} onPointerEnter={() => setSelected(index)} onClick={() => setSelected(index)}
          onKeyDown={event => navigate(event, index)} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-500">
          <rect x={x(index) - step * 0.3} y={y(item.value)} width={step * 0.6} height={bottom - y(item.value)} rx="5" fill={index === active ? "#252dae" : "#465fff"} />
          <rect x={x(index) - step / 2} y={top} width={step} height={bottom - top} fill="transparent" />
          <text aria-hidden="true" x={x(index)} y="278" textAnchor="middle" fontSize="20" fill="#344054">{item.label}</text>
        </g>)}
      </svg>
    </div>
    <p className="mt-4 text-sm text-gray-600">Penjualan sebelum pajak dan retur.</p>
    <p className="sr-only">Pilih batang untuk melihat nilai. Gunakan tombol panah untuk berpindah bulan. Geser grafik ke samping pada layar kecil.</p>
    <details className="mt-4">
      <summary className="min-h-13 cursor-pointer rounded-lg px-3 py-3 text-base font-medium text-brand-600 hover:bg-brand-50">Lihat Data Bulanan</summary>
      <div className="overflow-x-auto"><table className="w-full text-left text-base"><thead><tr className="border-b border-gray-200"><th className="px-3 py-4">Bulan</th><th className="px-3 py-4 text-right">Penjualan</th></tr></thead><tbody>{points.map(item => <tr key={item.label} className="border-b border-gray-100"><td className="px-3 py-4">{item.label}</td><td className="px-3 py-4 text-right tabular">{item.display}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}
