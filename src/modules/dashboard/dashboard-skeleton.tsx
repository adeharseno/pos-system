import { Card, CardContent } from "@/modules/ui/components";

export function DashboardSkeleton() {
  return <div role="status" aria-label="Memuat ringkasan penjualan" className="space-y-8">
    <span className="sr-only">Memuat ringkasan penjualan...</span>
    <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <Card key={index}><CardContent className="space-y-5 py-7! motion-safe:animate-pulse"><div className="h-5 w-3/4 rounded bg-gray-100" /><div className="h-9 w-1/2 rounded bg-gray-100" /></CardContent></Card>)}
    </div>
    <Card aria-hidden="true"><CardContent className="motion-safe:animate-pulse"><div className="mb-8 h-6 w-1/3 rounded bg-gray-100" /><div className="h-72 rounded-xl bg-gray-50" /></CardContent></Card>
  </div>;
}
