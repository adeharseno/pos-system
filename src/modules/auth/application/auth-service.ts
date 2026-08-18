import "server-only";

import { findEmployeeByAuthUserId, getVerifiedAuthUser, signOutAuthUser } from "../data/employee-auth-repository";
import { getCurrentEmployeeWith, getCurrentUserWith, logoutWith, requireEmployeeWith, requireRoleWith } from "./auth-policy";
import type { AuthDependencies } from "./auth-policy";
import type { EmployeeRole } from "../types";

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
