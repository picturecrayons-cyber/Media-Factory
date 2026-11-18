import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { acceptSuperAdminOrganizationInvite } from "@/lib/bridge/super-admin-organizations";

export const Route=createFileRoute("/organization-invite")({component:OrganizationInvite});
function OrganizationInvite(){
 const token=typeof window!=="undefined" ? new URLSearchParams(window.location.hash.slice(1)).get("token")??"" : "";
 return <RequireBridge allow="studio">{actor=><BridgeShell actor={actor} title="Studio organization invitation"><InviteBody token={token}/></BridgeShell>}</RequireBridge>;
}
function InviteBody({token}:{token:string}){
 const accept=useMutation({mutationFn:()=>acceptSuperAdminOrganizationInvite({data:{token}})});
 return <section className="max-w-2xl rounded-2xl border border-line bg-surface p-5 sm:p-6">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Verified Studio account required</p>
  <h2 className="mt-2 font-display text-2xl font-semibold">Join an organization</h2>
  <p className="mt-2 text-sm text-muted">Accepting links your verified Studio profile to the organization and activates the invited membership role. The invitation is single-use and expires after seven days.</p>
  {!token?<p role="alert" className="mt-4 text-sm text-accent">Invitation token is missing.</p>:null}
  {accept.isSuccess?<div className="mt-4 space-y-3"><p className="text-sm">Invitation accepted. Your Studio organization membership is active.</p><Link to="/studio" className="text-sm font-semibold text-accent">Open Studio dashboard →</Link></div>:null}
  {accept.isError?<p role="alert" className="mt-4 text-sm text-accent">{accept.error instanceof Error?accept.error.message:"Invitation could not be accepted"}</p>:null}
  {!accept.isSuccess?<Button className="mt-5" disabled={!token||accept.isPending} onClick={()=>accept.mutate()}>{accept.isPending?"Accepting…":"Accept invitation"}</Button>:null}
 </section>;
}
