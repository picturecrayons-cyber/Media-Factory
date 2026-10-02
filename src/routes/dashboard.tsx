import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  return <RequireBridge allow="super_admin">{(actor) => <BridgeShell actor={actor} title="Dashboard"><DashboardBody /></BridgeShell>}</RequireBridge>;
}

function DashboardBody() {
  const titlesQ = useQuery({ queryKey:["bridge-titles"], queryFn:()=>listTitles() });
  const titles = titlesQ.data?.titles ?? [];
  const review = titles.filter((t)=>["PREPARING","QC_REVIEW","RIGHTS_REVIEW"].includes(t.status)).length;
  const deals = titles.filter((t)=>["IN_NEGOTIATION","LICENSED"].includes(t.status)).length;
  const delivered = titles.filter((t)=>t.status==="DELIVERED").length;
  return <div className="space-y-5">
    <section className="bridge-panel rounded-3xl p-6 sm:p-8">
      <h2 className="max-w-3xl font-display text-2xl font-semibold sm:text-3xl">One bridge from content to market.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Prepare assets, clear QC and rights, license, and deliver from one canonical title workspace.</p>
      <div className="mt-5 flex gap-2"><Link to="/workspace" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#041018] shadow-[0_10px_30px_rgba(25,199,255,.18)] hover:bg-accent-strong">Open Titles</Link><Link to="/deliveries" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">Deliveries</Link></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Titles",titles.length],["In review",review],["Active deals",deals],["Delivered",delivered]].map(([label,value])=><div key={String(label)} className="bridge-stat rounded-2xl p-4 sm:p-5"><p className="text-xs uppercase tracking-wider text-muted">{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value}</p></div>)}
    </section>
  </div>;
}
