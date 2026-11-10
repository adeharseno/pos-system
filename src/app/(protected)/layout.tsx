import { redirect } from "next/navigation";

import { requireRequestEmployee } from "@/modules/auth/application/request-employee";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { AppShell } from "@/modules/ui/app-shell";
import { getPurchaseDueReminders } from "@/modules/purchasing/due-reminder-service";
import { getPendingSusulanNotifications } from "@/modules/sales/data/bpjs-susulan-queries";
import { getPendingReturnNotifications } from "@/modules/returns/data/return-queries";

export default async function ProtectedLayout({children}:{children:React.ReactNode}) {
  let employee;
  try {
    employee=await requireRequestEmployee();
  } catch(error) {
    const code=isAuthApplicationError(error)?error.code:"UNAUTHENTICATED";
    redirect(`/login?error=${code}`);
  }
  const [reminders, susulanNotifications, returnNotifications] = employee.role === "owner_admin"
    ? await Promise.all([
        getPurchaseDueReminders().catch(() => []),
        getPendingSusulanNotifications().catch(() => []),
        getPendingReturnNotifications().catch(() => []),
      ])
    : [[], [], []];

  return (
    <AppShell
      employee={{ name: employee.name, role: employee.role }}
      reminders={reminders}
      susulanNotifications={susulanNotifications}
      returnNotifications={returnNotifications}
    >
      {children}
    </AppShell>
  );
}
