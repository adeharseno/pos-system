"use client";
import { Button, Container, Card, CardContent } from "@/modules/ui/components";
export default function EmployeesError({ reset }: { reset: () => void }) {
  return <Container><Card><CardContent><h1 className="text-xl font-semibold">Daftar karyawan belum dapat dibuka</h1><p className="my-4">Periksa koneksi Anda lalu coba kembali.</p><Button onClick={reset}>Coba Lagi</Button></CardContent></Card></Container>;
}
