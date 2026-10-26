import { EmployeeManagementError } from "../employee-errors";

export interface InvitationClaim {
  employee_id: string; auth_user_id: string; email: string; attempt_id: string; status: string;
}
export interface InvitationDependencies {
  claim: () => Promise<InvitationClaim>;
  ensureUser: (claim: InvitationClaim) => Promise<void>;
  link: (claim: InvitationClaim) => Promise<void>;
  send: (claim: InvitationClaim) => Promise<void>;
  sent: (claim: InvitationClaim) => Promise<void>;
  fail: (claim: InvitationClaim, code: "EMAIL_CONFLICT" | "PROVISIONING_FAILED" | "DELIVERY_FAILED") => Promise<void>;
}

export async function inviteEmployeeWith(deps: InvitationDependencies) {
  const claim = await deps.claim(); // A live lease excludes parallel workers.
  let phase: "provision" | "send" = "provision";
  try {
    await deps.ensureUser(claim); // Reserved UUID makes creation recoverable after a lost response.
    await deps.link(claim);
    phase = "send";
    await deps.send(claim);
    await deps.sent(claim);
    return { status: "invited" as const, message: "Undangan berhasil dikirim." };
  } catch (error) {
    const code = error instanceof EmployeeManagementError && error.code === "EMAIL_CONFLICT"
      ? "EMAIL_CONFLICT" : phase === "send" ? "DELIVERY_FAILED" : "PROVISIONING_FAILED";
    // If recording failure is unavailable, the persisted lease expires and a new Owner can retry.
    await deps.fail(claim, code).catch(() => {});
    throw new EmployeeManagementError(code);
  }
}
