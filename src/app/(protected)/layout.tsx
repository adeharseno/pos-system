import { redirect } from "next/navigation";

import { requireEmployee } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { getCurrentCashDrawer } from "@/modules/cash-drawer/application/cash-drawer-service";
import { AppShell } from "@/modules/ui/app-shell";

export default async function ProtectedLayout({children}:{children:React.ReactNode}) {
  let employee;
  try {
    employee=await requireEmployee();
  } catch(error) {
    const code=isAuthApplicationError(error)?error.code:"UNAUTHENTICATED";
    redirect(`/login?error=${code}`);
  }
  const drawer=employee.role==="staf"?null:await getCurrentCashDrawer(employee.employeeId);
  return <AppShell employee={{name:employee.name,role:employee.role}} drawerOpen={Boolean(drawer)}>{children}</AppShell>;
}
