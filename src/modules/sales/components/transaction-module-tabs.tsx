import Link from "next/link";

export type TransactionModuleTabKey = "history" | "receivables" | "returns";

export function TransactionModuleTabs({
  current,
  isOwner,
  showReturnsTab = isOwner,
}: {
  current: TransactionModuleTabKey;
  isOwner: boolean;
  showReturnsTab?: boolean;
}) {
  const tabs: Array<{ key: TransactionModuleTabKey; label: string; href: string; visible: boolean }> = [
    { key: "history", label: "Riwayat Transaksi", href: "/transactions", visible: true },
    { key: "receivables", label: "Piutang", href: "/transactions/receivables", visible: isOwner },
    { key: "returns", label: "Retur", href: "/returns", visible: showReturnsTab },
  ];

  const visibleTabs = tabs.filter((tab) => tab.visible);

  return (
    <nav
      aria-label="Navigasi modul transaksi"
      className="flex flex-wrap gap-2 border-b border-gray-200 pb-3"
    >
      {visibleTabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition sm:text-base ${
              active
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-xs"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

