import { redirect } from "next/navigation";

import { requireRequestEmployee } from "@/modules/auth/application/request-employee";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { AppShell } from "@/modules/ui/app-shell";
import { getPurchaseDueReminders } from "@/modules/purchasing/due-reminder-service";

export default async function ProtectedLayout({children}:{children:React.ReactNode}) {
  let employee;
  try {
    employee=await requireRequestEmployee();
  } catch(error) {
    const code=isAuthApplicationError(error)?error.code:"UNAUTHENTICATED";
    redirect(`/login?error=${code}`);
  }
  const reminders=employee.role==="owner_admin"?await getPurchaseDueReminders().catch(()=>[]):[];
  return <AppShell employee={{name:employee.name,role:employee.role}} reminders={reminders}>{children}</AppShell>;
}
