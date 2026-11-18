import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { getSuperAdminRbacGovernance, listSuperAdminRoleAssignments, updateSuperAdminRoleAssignment } from "@/lib/bridge/super-admin-rbac";
import type { InternalRole } from "@/lib/bridge/types";

export const Route = createFileRoute("/rbac-governance")({ component: RbacGovernance });

function RbacGovernance() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="RBAC governance">
          <RbacGovernanceBody currentUserId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function RbacGovernanceBody({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const assignmentsQ = useQuery({
    queryKey: ["super-admin-rbac-assignments"],
    queryFn: () => listSuperAdminRoleAssignments(),
    retry: false,
  });
  const roleMutation = useMutation({
    mutationFn: (data: { userId: string; role: InternalRole | null }) => updateSuperAdminRoleAssignment({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-rbac-assignments"] });
      qc.invalidateQueries({ queryKey: ["super-admin-rbac-governance"] });
    },
  });
  const query = useQuery({
    queryKey: ["super-admin-rbac-governance"],
    queryFn: () => getSuperAdminRbacGovernance(),
    retry: false,
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Policy registry · read only</p>
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Role and permission matrix</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          This is the checked-in application policy, not a live inventory of assigned users. Staff roles and account entitlements are shown separately.
        </p>
      </section>

      {query.isPending ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading RBAC policy…</p>
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">RBAC policy is unavailable.</p>
      ) : data ? (
        <>
          <section className="rounded-xl border border-line p-4 sm:p-5">
            <h3 className="font-semibold">Policy source and limits</h3>
            <p className="mt-2 text-sm text-muted">Source: {data.source}. User role assignments: {data.assignments}. Role mutation controls: {data.mutationControls}.</p>
            <p className="mt-2 text-sm text-muted">Email verification and server-side authorization remain mandatory. This matrix does not grant or change any user access.</p>
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">Internal staff roles</h3><p className="text-xs text-muted">Permission sets and which internal roles each role may grant under the current application policy.</p></div>
            {data.internalRoles.map((role) => (
              <article key={role.role} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">{role.role.replaceAll("_", " ")}</h4>
                  <span className="text-xs text-muted">{role.permissions.length} permissions</span>
                </div>
                <p className="mt-2 text-xs text-muted">May grant: {role.mayGrant.length ? role.mayGrant.join(", ") : "No internal roles"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => <span key={permission} className="rounded-full border border-line px-2.5 py-1 text-[11px]">{permission}</span>)}
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">Live user role assignments</h3><p className="text-xs text-muted">Canonical Bridge profiles. Super Admin assignments are protected and cannot be granted or changed here.</p></div>
            {assignmentsQ.isPending ? <p className="rounded-xl border border-line p-5 text-sm text-muted">Loading user assignments…</p> :
             assignmentsQ.isError ? <p role="alert" className="rounded-xl border border-line p-5 text-sm text-muted">Live role assignments are unavailable.</p> :
             <>
              <p className="rounded-xl border border-line p-4 text-sm text-muted">
                {assignmentsQ.data?.mutationsEnabled ? "Audited role changes are enabled by a Preview-only server feature flag." : "Role changes are fail-closed and currently disabled. They require an explicit Preview-only deployment setting and verified target identity."}
              </p>
              <div className="overflow-hidden rounded-2xl border border-line">
               <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                 <thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-4 py-3">Profile</th><th className="px-4 py-3">Account type</th><th className="px-4 py-3">Email verified</th><th className="px-4 py-3">Current role</th><th className="px-4 py-3">Change role</th><th className="px-4 py-3">Action</th></tr></thead>
                 <tbody className="divide-y divide-line">
                  {(assignmentsQ.data?.assignments??[]).map(profile=>{
                   const current=profile.internalRole??"none";
                   const draft=draftRoles[profile.userId]??current;
                   const protectedProfile=profile.internalRole==="super_admin";
                   const disabled=!assignmentsQ.data?.mutationsEnabled||protectedProfile||!profile.emailVerified||profile.userId===currentUserId||roleMutation.isPending;
                   return <tr key={profile.userId}>
                    <td className="px-4 py-3"><p className="font-medium">{profile.displayName}</p><p className="text-xs text-muted">{profile.email}</p></td>
                    <td className="px-4 py-3">{profile.accountType}</td>
                    <td className="px-4 py-3">{profile.emailVerified?"Verified":"Unverified"}</td>
                    <td className="px-4 py-3">{current.replaceAll("_"," ")}</td>
                    <td className="px-4 py-3"><select aria-label={`Role for ${profile.email}`} value={draft} disabled={disabled} onChange={e=>setDraftRoles(v=>({...v,[profile.userId]:e.target.value}))} className="h-9 rounded-lg border border-line bg-elevated px-2 text-xs">
                     <option value="none">No internal role</option>
                     {data.internalRoles.filter(r=>r.role!=="super_admin").map(r=><option key={r.role} value={r.role}>{r.role.replaceAll("_"," ")}</option>)}
                    </select></td>
                    <td className="px-4 py-3"><button type="button" disabled={disabled||draft===current} onClick={()=>roleMutation.mutate({userId:profile.userId,role:draft==="none"?null:draft as InternalRole},{onSuccess:()=>setDraftRoles(v=>({...v,[profile.userId]:draft}))})} className="rounded-full border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">Save role</button>{protectedProfile?<p className="mt-1 text-[10px] text-muted">Protected</p>:null}</td>
                   </tr>;
                  })}
                 </tbody>
                </table>
               </div>
              </div>
              {roleMutation.isError?<p role="alert" className="text-sm text-accent">{roleMutation.error instanceof Error?roleMutation.error.message:"Role update failed"}</p>:null}
             </>}
          </section>

          <section className="space-y-3">
            <div><h3 className="font-display text-lg font-semibold">External account entitlements</h3><p className="text-xs text-muted">These are account-type permissions, not internal staff roles.</p></div>
            {data.accountTypes.map((account) => (
              <article key={account.accountType} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-semibold">{account.accountType.replaceAll("_", " ")}</h4>
                  <span className="text-xs text-muted">{account.permissions.length} permissions</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {account.permissions.map((permission) => <span key={permission} className="rounded-full border border-line px-2.5 py-1 text-[11px]">{permission}</span>)}
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
