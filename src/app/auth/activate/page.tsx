import type { Metadata } from "next";
import { invitationSetupAvailable } from "@/modules/auth/application/employee-service";
import { InvitationActivation } from "@/modules/auth/components/invitation-activation";
export const metadata: Metadata = { title: "Aktivasi Akun | Pharmacy POS", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ActivateAccount({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ready = status !== "invalid" && await invitationSetupAvailable();
  return <main className="grid min-h-screen place-items-center bg-[var(--surface-subtle)] p-4 sm:p-6"><InvitationActivation ready={ready} /></main>;
}
