import "server-only";

import { findEmployeeByAuthUserId, getVerifiedAuthUser, signOutAuthUser } from "../data/employee-auth-repository";
import { getCurrentEmployeeWith, getCurrentUserWith, logoutWith, requireEmployeeWith, requireRoleWith } from "./auth-policy";
import type { AuthDependencies } from "./auth-policy";
import type { EmployeeRole } from "../types";
import { loadPermissions } from "../data/permission-repository";
import { requireAllPermissionsWith } from "./permission-policy";

const defaultDependencies: AuthDependencies = {
  getUser: getVerifiedAuthUser,
  findEmployee: findEmployeeByAuthUserId,
  signOut: signOutAuthUser,
};

export const getCurrentUser = () => getCurrentUserWith(defaultDependencies);
export const getCurrentEmployee = () => getCurrentEmployeeWith(defaultDependencies);
export const requireEmployee = () => requireEmployeeWith(defaultDependencies);
export const requireRole = (allowedRoles: readonly EmployeeRole[]) => requireRoleWith(allowedRoles, defaultDependencies);
export const requirePosOperator = () => requireRole(["owner_admin", "kasir"]);
export const logout = () => logoutWith(defaultDependencies);

// Existing role guards deliberately retain their behavior until each caller migrates.
export const requireAllPermissions = (permissions: readonly string[]) =>
  requireAllPermissionsWith(permissions, { ...defaultDependencies, loadPermissions });
export const requirePermission = (permission: string) => requireAllPermissions([permission]);
