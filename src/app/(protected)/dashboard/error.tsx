"use client";
import { Button, Card, CardContent, Container } from "@/modules/ui/components";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <Container size="xl"><Card><CardContent><h1 className="text-xl font-semibold">Dashboard belum dapat dimuat</h1><p role="alert" className="my-4 text-sm text-gray-500">Periksa koneksi Anda, lalu coba lagi.</p><Button type="button" onClick={reset}>Coba Lagi</Button></CardContent></Card></Container>;
}
