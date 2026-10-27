import "server-only";
import { cache } from "react";
import { requireEmployee } from "./auth-service";

// Request-scoped only: share the unchanged guard between layout and dashboard.
export const requireRequestEmployee = cache(requireEmployee);
