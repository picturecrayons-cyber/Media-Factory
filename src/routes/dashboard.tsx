import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES, loopStageType } from "@/lib/bridge/loop-lanes";
import { getDashboardSession } from "@/lib/bridge/session";
import { FounderCommandCentre } from "@/components/bridge/founder-command-centre";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Founder control centre">
          <DashboardBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const ADMIN_MODULES = [
  {
    title: "Titles & media",
    description: "Title records, metadata, artwork, uploads, QC and rights.",
    to: "/workspace",
  },
  {
    title: "Operations & approvals",
    description: "Operational review workstations and approval queues.",
    to: "/admin/workstations",
  },
  {
    title: "Buyer desk & licensing",
    description: "Buyer activity, offers and licensing workflow.",
    to: "/buyer",
  },
  {
    title: "Deliveries & services",
    description: "Delivery work and service requests.",
    to: "/deliveries",
  },
  {
    title: "People &ֻǱ˞