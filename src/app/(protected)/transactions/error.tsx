"use client";
import { Button, Card, CardContent, Container } from "@/modules/ui/components";

export default function TransactionError({ retry }: { retry: () => void }) {
  return <Container size="xl"><Card><CardContent className="space-y-5"><h1 className="text-xl font-semibold text-gray-900">Transaksi belum dapat dimuat</h1><p role="alert" className="text-base text-gray-700">Periksa koneksi Anda, lalu coba lagi.</p><Button type="button" onClick={retry}>Coba Lagi</Button></CardContent></Card></Container>;
}
