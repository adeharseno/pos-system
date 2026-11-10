import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/application/auth-service";
import { getReturnDetail } from "@/modules/returns/data/return-queries";
import { requireUuid } from "@/modules/shared/validation/input";
import { ReturnDetailView } from "@/modules/returns/components/return-detail-view";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await requirePermission("returns.view");
  const { id } = await params;
  let returnId: string;
  try {
    returnId = requireUuid(id, "returnId");
  } catch {
    notFound();
  }

  const detail = await getReturnDetail(returnId);
  if (!detail) notFound();

  const isOwner = employee.role === "owner_admin";

  return (
    <ReturnDetailView
      detail={detail}
      canApprove={isOwner}
      canComplete={isOwner}
    />
  );
}

