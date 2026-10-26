import { redirect } from "next/navigation";
import { getEmployeePermissionCatalog, requireEmployeeManager } from "@/modules/auth/application/employee-service";
import { isAuthApplicationError } from "@/modules/auth/errors";
import { EmployeesWorkspace } from "@/modules/auth/components/employees-workspace";
import { Container } from "@/modules/ui/components";

export default async function EmployeesPage() {
  try { await requireEmployeeManager("employees.view"); }
  catch (error) {
    if (isAuthApplicationError(error)) redirect(error.code === "FORBIDDEN" ? "/dashboard" : "/login");
    throw error;
  }
  const catalog = await getEmployeePermissionCatalog();
  return <Container size="xl"><EmployeesWorkspace catalog={catalog} /></Container>;
}
