import type { Database } from "@/types/database.types";

export type EmployeeRole = Database["public"]["Enums"]["employee_position"];

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface EmployeeRecord {
  employeeId: string;
  name: string;
  role: EmployeeRole;
  isActive: boolean;
}

export interface EmployeeSession {
  employeeId: string;
  authUserId: string;
  name: string;
  role: EmployeeRole;
}
