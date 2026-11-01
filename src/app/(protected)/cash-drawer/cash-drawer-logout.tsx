import { logoutAction } from "@/modules/auth/actions";

export function CashDrawerLogout() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        Keluar
      </button>
    </form>
  );
}
