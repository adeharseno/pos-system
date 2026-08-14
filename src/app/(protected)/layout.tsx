import { redirect } from "next/navigation";

import { requireEmployee } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";

export default async function ProtectedLayout({children}:{children:React.ReactNode}) {
  try {
    await requireEmployee();
  } catch(error) {
    const code=isAuthApplicationError(error)?error.code:"UNAUTHENTICATED";
    redirect(`/login?error=${code}`);
  }
  return children;
}
