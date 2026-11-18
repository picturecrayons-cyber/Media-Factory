import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { createSuperAdminOrganizationInvite, listSuperAdminOrganizationGovernance, updateSuperAdminOrganizationMembership } from "@/lib/bridge/super-admin-organizations";

export const Route = createFileRoute("/organization-governance")({ component: OrganizationGovernance });

function OrganizationGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Organization governance">
          <OrganizationGovernanceBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OrganizationGovernanceBody() {
  const qc=useQueryClient();
  const [orgId,setOrgId]=useState("");
  const [email,setEmail]=useState("");
  const [inviteRole,setInviteRole]=useState("member");
  const [evidence,setEvidence]=useState<Record<string,string>>({});
  const [membershipDraft,setMembershipDraft]=useState<Record<string,string>>({});
  const [inviteUrl,setInviteUrl]=useState<string|null>(null);
  const query = useQuery({
    queryKey: ["super-admin-organization-governance"],
    queryFn: () => listSuperAdminOrganizationGovernance(),
    retry: false,
  });
  const organizations = query.data?.organizations ?? [];
  const memberships = query.data?.memberships ?? [];
  const inviteMutation=useMutation({mutationFn:()=>createSuperAdminOrganizationInvite({data:{organizationId:orgId,email,role:inviteRole as "admin"|"member"|"producer"|"dit"}}),onSuccess:(result)=>{setInviteUrl(result.inviteUrl);setEmail("");}});
  const membershipMutation=useMutation({mutationFn:(v:{organizationId:string;userId:string;role:"admin"|"member"|"producer"|"dit";status:"active"|"suspended"|"removed";evidenceReference:string})=>updateSuperAdminOrganizationMembership({data:v}),onSuccess:()=>qc.invalidateQueries({queryKey:["super-admin-organization-governance"]})});

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Governance · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Organizations & memberships</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Displays canonical organization and membership records. Invitation and membership mutations are server-side audited but fail-closed behind a Preview-only feature flag. No invitation email is sent.
        </p>
      </section>

      {query.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading organization records…</p>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">
          Organization data is unavailable. The organization schema or server data source could not be verified; no empty-state assumption is made.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <Metric label="Organizations" value={organizations.length.toLocaleString("en-IN")} />
            <Metric label="Membership records" value={memberships.length.toLocaleString("en-IN")} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Canonical organizations</h3>
              <p className="mt-1 text-xs text-muted">Latest 200 records; membership counts include all recorded statuses.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-4 py-3">Legal name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Created</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {organizations.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3"><p className="font-medium">{row.legalName}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.id}</p></td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3 tabular-nums">{row.memberCount}</td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                  {!organizations.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No organization records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-3">
            <div><h3 className="font-semibold">Invite a Studio member</h3><p className="mt-1 text-xs text-muted">Creates a seven-day, single-use invitation URL for a verified Studio account. The URL is displayed once; no email or SMS is sent.</p></div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_160px_auto]">
              <select value={orgId} onChange={e=>setOrgId(e.target.value)} className="h-10 rounded-lg border border-line bg-elevated px-2 text-sm"><option value="">Choose organization</option>{organizations.filter(o=>o.status==="active").map(o=><option key={o.id} value={o.id}>{o.legalName}</option>)}</select>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Verified account email" className="h-10 rounded-lg border border-line bg-elevated px-3 text-sm"/>
              <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="h-10 rounded-lg border border-line bg-elevated px-2 text-sm"><option value="member">Member</option><option value="producer">Producer</option><option value="dit">DIT</option><option value="admin">Organization admin</option></select>
              <button type="button" disabled={!query.data?.mutationsEnabled||!orgId||!email.includes("@")||inviteMutation.isPending} onClick={()=>inviteMutation.mutate()} className="rounded-full border border-line px-4 py-2 text-xs font-semibold disabled:opacity-40">Create invite</button>
            </div>
            {!query.data?.mutationsEnabled?<p className="text-xs text-muted">Organization writes are disabled by default. The Preview-only feature flag must be separately enabled after the migration and identity gates pass.</p>:null}
            {inviteUrl?<div className="rounded-lg border border-line p-3"><p className="text-xs text-muted">Invitation URL · expires in seven days · not emailed</p><input readOnly value={inviteUrl} className="mt-2 h-10 w-full rounded-lg border border-line bg-elevated px-3 text-xs"/></div>:null}
            {inviteMutation.isError?<p role="alert" className="text-xs text-accent">{inviteMutation.error instanceof Error?inviteMutation.error.message:"Invitation could not be created"}</p>:null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <h3 className="font-semibold">Membership records</h3>
              <p className="mt-1 text-xs text-muted">Account email and identity-provider credentials are not exposed. Non-owner role changes require an evidence reference.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Member</th><th className="px-4 py-3">Account type</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Governance change</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {memberships.map((row) => (
                    <tr key={row.userReference + row.organizationId}>
                      <td className="px-4 py-3">{row.organizationName}</td>
                      <td className="px-4 py-3"><p className="font-medium">{row.displayName}</p><p className="mt-1 font-mono text-[10px] text-muted">{row.userReference}</p></td>
                      <td className="px-4 py-3">{row.accountType}</td>
                      <td className="px-4 py-3">{row.role}</td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3">
                        {row.role==="owner" ? <span className="text-xs text-muted">Owner protected</span> : (
                          <div className="min-w-[260px] space-y-2">
                            <select value={membershipDraft[row.organizationId+":"+row.userReference]??row.role} disabled={!query.data?.mutationsEnabled||membershipMutation.isPending} onChange={e=>setMembershipDraft(v=>({...v,[row.organizationId+":"+row.userReference]:e.target.value}))} className="h-9 w-full rounded-lg border border-line bg-elevated px-2 text-xs">
                              {["admin","member","producer","dit"].map(role=><option key={role} value={role}>{role}</option>)}
                            </select>
                            <input value={evidence[row.organizationId+":"+row.userReference]??""} onChange={e=>setEvidence(v=>({...v,[row.organizationId+":"+row.userReference]:e.target.value}))} placeholder="Evidence reference (required)" className="h-9 w-full rounded-lg border border-line bg-elevated px-2 text-xs"/>
                            <button type="button" disabled={!query.data?.mutationsEnabled||!evidence[row.organizationId+":"+row.userReference]?.trim()||(membershipDraft[row.organizationId+":"+row.userReference]??row.role)===row.role||membershipMutation.isPending} onClick={()=>membershipMutation.mutate({organizationId:row.organizationId,userId:row.userReference,role:(membershipDraft[row.organizationId+":"+row.userReference]??row.role) as "admin"|"member"|"producer"|"dit",status:row.status as "active"|"suspended"|"removed",evidenceReference:evidence[row.organizationId+":"+row.userReference]})} className="rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">Save membership</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!memberships.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No membership records are currently available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
          {membershipMutation.isError?<p role="alert" className="text-sm text-accent">{membershipMutation.error instanceof Error?membershipMutation.error.message:"Membership update failed"}</p>:null}
        </>
      )}

      <section className="rounded-xl border border-line p-4 sm:p-5">
        <h3 className="font-semibold">Invitation and ownership boundaries</h3>
        <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <li>• Invitation URL is single-use, expires after seven days and is not emailed.</li>
          <li>• Acceptance requires an authenticated Studio account with matching verified email.</li>
          <li>• Membership role changes require a recorded evidence reference; the evidence itself is not independently verified here.</li>
          <li>• Owner memberships and Super Admin profiles are protected.</li>
          <li>• Legal ownership requires independent evidence and review.</li>
          <li>• Writes remain disabled until the Preview-only feature flag and migration gates are separately approved.</li>
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-line bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-IN");
}
