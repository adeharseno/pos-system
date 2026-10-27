import { DashboardSkeleton } from "@/modules/dashboard/dashboard-skeleton";
import { Container } from "@/modules/ui/components";

export default function Loading() {
  return <Container size="xl"><DashboardSkeleton /></Container>;
}
