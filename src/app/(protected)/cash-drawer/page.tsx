import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { closeCashDrawerAction,openCashDrawerAction } from "@/modules/cash-drawer/actions";
import { getCurrentCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
export default async function CashDrawerPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const employee=await requirePosOperator();const drawer=await getCurrentCashDrawer(employee.employeeId);const query=await searchParams;
  return <main className="mx-auto grid min-h-screen max-w-lg content-center gap-5 p-6"><div><h1 className="text-2xl font-semibold">Cash Drawer</h1><p className="text-sm text-gray-600">{employee.name} ({employee.role})</p></div>
    {query.error?<p role="alert" className="text-red-700">Operasi gagal: {query.error}</p>:null}
    {query.closed?<section className="rounded border p-4"><h2 className="font-semibold">Drawer ditutup</h2><p>Expected: {query.expected}</p><p>Actual: {query.actual}</p><p>Difference: {query.difference}</p></section>:null}
    {!drawer?<form action={openCashDrawerAction} className="grid gap-3 rounded border p-4"><h2 className="font-semibold">Open Cash Drawer</h2><label className="grid gap-1">Opening Balance<input className="rounded border px-3 py-2" required min="0" step="0.01" name="opening_balance" type="number" /></label><button className="rounded bg-black px-4 py-2 text-white">Open Drawer</button></form>:
    <section className="grid gap-3 rounded border p-4"><h2 className="font-semibold">Drawer Open</h2><p>Opening Balance: {drawer.opening_balance}</p><p>Opened At: {new Date(drawer.opened_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</p><form action={closeCashDrawerAction} className="grid gap-3"><input type="hidden" name="session_id" value={drawer.id}/><label className="grid gap-1">Actual Cash Count<input className="rounded border px-3 py-2" required min="0" step="0.01" name="actual_closing_cash" type="number" /></label><button className="rounded border px-4 py-2">Close Drawer</button></form></section>}
  </main>;
}
