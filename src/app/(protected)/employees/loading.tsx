import { Container, Card, CardContent } from "@/modules/ui/components";
export default function LoadingEmployees() {
  return <Container size="xl"><h1 className="mb-6 text-2xl font-bold">Karyawan</h1><Card><CardContent><p role="status">Memuat daftar karyawan…</p></CardContent></Card></Container>;
}
