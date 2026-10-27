import { Card, CardContent, Container } from "@/modules/ui/components";

export function TransactionLoading() {
  return <Container size="xl"><div role="status" aria-label="Memuat transaksi" className="space-y-7">
    <span className="sr-only">Memuat transaksi...</span>
    <div aria-hidden="true" className="h-9 w-48 rounded-lg bg-gray-100 motion-safe:animate-pulse" />
    <Card aria-hidden="true"><CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-3 motion-safe:animate-pulse"><div className="h-5 w-1/2 rounded bg-gray-100" /><div className="h-13 rounded-lg bg-gray-100" /></div>)}</CardContent></Card>
    <Card aria-hidden="true"><CardContent className="space-y-6 motion-safe:animate-pulse">{[0, 1, 2].map(index => <div key={index} className="h-20 rounded-lg bg-gray-50" />)}</CardContent></Card>
  </div></Container>;
}
