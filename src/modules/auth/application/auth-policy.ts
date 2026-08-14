import { AuthApplicationError } from "../errors";
import type { AuthenticatedUser, EmployeeRecord, EmployeeRole, EmployeeSession } from "../types";

export interface AuthDependencies {
  getUser: () => Promise<AuthenticatedUser | null>;
  findEmployee: (authUserId: string) => Promise<EmployeeRecord | null>;
  signOut: () => Promise<void>;
}

export const getCurrentUserWith = (dependencies: AuthDependencies) => dependencies.getUser();

export async function getCurrentEmployeeWith(dependencies: AuthDependencies): Promise<EmployeeSession | null> {
  const user = await dependencies.getUser();
  if (!user) return null;
  const employee = await dependencies.findEmployee(user.id);
  if (!employee) throw new AuthApplicationError("EMPLOYEE_NOT_FOUND");
  if (!employee.isActive) throw new AuthApplicationError("EMPLOYEE_INACTIVE");
  return { employeeId: employee.employeeId, authUserId: user.id, name: employee.name, role: employee.role };
}

export async function requireEmployeeWith(dependencies: AuthDependencies): Promise<EmployeeSession> {
  const employee = await getCurrentEmployeeWith(dependencies);
  if (!employee) throw new AuthApplicationError("UNAUTHENTICATED");
  return employee;
}

export async function requireRoleWith(allowedRoles: readonly EmployeeRole[], dependencies: AuthDependencies) {
  const employee = await requireEmployeeWith(dependencies);
  if (!allowedRoles.includes(employee.role)) throw new AuthApplicationError("FORBIDDEN");
  return employee;
}

export const logoutWith = (dependencies: AuthDependencies) => dependencies.signOut();

export function withEmployeeIdentity<Input extends Record<string, unknown>>(
  employee: EmployeeSession,
  input: Input,
): Omit<Input, "employeeId"> & { employeeId: string } {
  return { ...input, employeeId: employee.employeeId };
}
