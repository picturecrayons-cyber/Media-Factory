import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listDeliveryTraces } from "@/lib/bridge/deliveries";

export const Route = createFileRoute("/deliveries")({ component: Deliveries });

function Deliveries() {
  return <RequireBridge>{(actor)=><BridgeShell actor={actor} title="Deliveries"><DeliveryList /></BridgeShell>}</RequireBridge>;
}

function DeliveryList(){
 const q=useQuery({queryKey:["bridge-delivery-traces"],queryFn:()=>listDeliveryTraces()});
 const rows=q.data?.deliveries??[];
 if(q.isPending)return <p className="text-sm text-muted">Loading deliveries…</p>;
 return <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
   <div className="divide-y divide-line rounded-xl border border-line">
     {rows.map((row)=>{
       const first=row.destinations[0];
       return <Link key={row.titleId} to="/title/$id" params={{id:row.titleId}} className="grid gap-2 p-4 hover:bg-fg/5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] sm:items-center">
         <div className="min-w-0">
           <p className="truncate text-sm font-semibold">{row.titleName}</p>
           <p className="truncate text-xs text-muted">{row.creator} · {row.language}{row.year?` · ${row.year}`:""}</p>
         </div>
         <p className="truncate text-xs text-muted">
           Buyer: {first?.buyer ?? "—"} · Investors: {row.investorCount} · Delivery: {first?.state ?? "HOLD"}
         </p>
         <span className="justify-self-start rounded-full border border-line px-3 py-1 text-[10px] font-semibold sm:justify-self-end">
           {row.settlementStatus}
         </span>
       </Link>;
     })}
   </div>
   {!rows.length?<p className="p-5 text-sm text-muted">No deliveries available.</p>:null}
 </section>;
}
