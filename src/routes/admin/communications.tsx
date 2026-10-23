import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  createBuyerProspect,
  listBuyerProspects,
  linkBuyerCommunicationThread,
  listMyBuyerCommunicationThreads,
  prepareBuyerMailDraft,
} from "@/lib/bridge/communications.server";

export const Route = createFileRoute("/admin/communications")({ component: AdminCommunications });

function AdminCommunications() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (!["admin", "super_admin"].includes(actor.internalRole ?? "")) {
          return <BridgeShell actor={actor} title="Buyer communications"><p className="rounded-xl border border-line p-5 text-sm">Admin access required.</p></BridgeShell>;
        }
        return <CommunicationsDesk actor={actor} />;
      }}
    </RequireBridge>
  );
}

function CommunicationsDesk({ actor }: { actor: any }) {
  const client = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<"MANUAL" | "HOSTINGER_MAIL" | "REFERRAL" | "EVENT" | "WEB">("MANUAL");
  const [prospectId, setProspectId] = useState("");
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState<"HOSTINGER_MAIL" | "BRIDGE_INTERNAL" | "OTHER">("HOSTINGER_MAIL");
  const [externalThreadId, setExternalThreadId] = useState("");
  const [mailboxAccountRef, setMailboxAccountRef] = useState("");
  const [threadId, setThreadId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [notice, setNotice] = useState("");

  const prospectsQ = useQuery({ queryKey: ["bridge-buyer-prospects"], queryFn: () => listBuyerProspects() });
  const threadsQ = useQuery({ queryKey: ["bridge-my-communication-threads"], queryFn: () => listMyBuyerCommunicationThreads({ data: {} }) });

  const createProspect = useMutation({
    mutationFn: () => createBuyerProspect({ data: { companyName, companyDomain: domain || undefined, contactName: contactName || undefined, contactEmail: email || undefined, source } }),
    onSuccess: (result) => { setNotice("Prospect saved as UNVERIFIED."); setProspectId(result.id); setCompanyName(""); setDomain(""); setContactName(""); setEmail(""); void client.invalidateQueries({ queryKey: ["bridge-buyer-prospects"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save prospect."),
  });
  const linkThread = useMutation({
    mutationFn: () => linkBuyerCommunicationThread({ data: { prospectId, subject, channel, externalThreadId: externalThreadId || undefined, mailboxAccountRef: mailboxAccountRef || undefined } }),
    onSuccess: (result) => { setNotice("Thread link saved. No email was sent."); setThreadId(result.id); setSubject(""); void client.invalidateQueries({ queryKey: ["bridge-my-communication-threads"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not link thread."),
  });
  const saveDraft = useMutation({
    mutationFn: () => prepareBuyerMailDraft({ data: { threadId, idempotencyKey: `draft-${threadId}-${draftSubject.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, recipients: recipients.split(/[;,\n]/).map((v) => v.trim()).filter(Boolean), subject: draftSubject, bodyText } }),
    onSuccess: () => { setNotice("Draft saved to the Bridge outbox. It has not been sent."); setDraftSubject(""); setBodyText(""); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save draft."),
  });

  return (
    <BridgeShell actor={actor} title="Global buyer communications">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Buyer prospect registry</h2>
          <p className="mt-1 text-sm text-muted">Prospects remain unverified until reviewed. Creating a prospect does not create an account, contract or content entitlement.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); createProspect.mutate(); }}>
            <input className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" required placeholder="Company / buyer name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <input className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Company domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <input className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <input className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" type="email" placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="MANUAL">Manual</option><option value="HOSTINGER_MAIL">Hostinger Mail</option><option value="REFERRAL">Referral</option><option value="EVENT">Event</option><option value="WEB">Web research</option>
            </select>
            <button className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={createProspect.isPending}>Save unverified prospect</button>
          </form>
          {prospectsQ.isError ? <p role="alert" className="mt-3 text-sm text-muted">Prospects unavailable. Confirm staging migration is applied before testing.</p> : null}
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="p-2">Company</th><th className="p-2">Contact</th><th className="p-2">Pipeline</th><th className="p-2">Verification</th><th className="p-2">Use</th></tr></thead>
              <tbody className="divide-y divide-line">
                {(prospectsQ.data?.prospects ?? []).map((p) => <tr key={p.id}><td className="p-2"><div className="font-medium">{p.company_name}</div><div className="text-xs text-muted">{p.company_domain ?? "No domain"}</div></td><td className="p-2">{p.contact_name ?? "—"}<div className="text-xs text-muted">{p.contact_email ?? ""}</div></td><td className="p-2">{p.pipeline_stage}</td><td className="p-2">{p.verification_status}</td><td className="p-2"><button className="underline" type="button" onClick={() => setProspectId(p.id)}>Link thread</button></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Link a conversation</h2>
          <p className="mt-1 text-sm text-muted">Links an existing Hostinger Mail thread to a prospect. This does not fetch mail from Hostinger or send anything.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); linkThread.mutate(); }}>
            <select required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={prospectId} onChange={(e) => setProspectId(e.target.value)}><option value="">Choose prospect</option>{(prospectsQ.data?.prospects ?? []).map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}</select>
            <input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Thread subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <select className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}><option value="HOSTINGER_MAIL">Hostinger Mail</option><option value="BRIDGE_INTERNAL">Bridge internal</option><option value="OTHER">Other</option></select>
            {channel === "HOSTINGER_MAIL" ? <><input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Exact Hostinger thread ID" value={externalThreadId} onChange={(e) => setExternalThreadId(e.target.value)} /><input className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Mailbox account reference" value={mailboxAccountRef} onChange={(e) => setMailboxAccountRef(e.target.value)} /></> : null}
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={linkThread.isPending}>Save thread link</button>
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Prepare email draft</h2>
          <p className="mt-1 text-sm text-muted">Drafts are stored in the Bridge outbox and are never sent by this action. A future send action must require explicit confirmation and audited Hostinger result.</p>
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); saveDraft.mutate(); }}>
            <select required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={threadId} onChange={(e) => setThreadId(e.target.value)}><option value="">Choose your linked thread</option>{(threadsQ.data?.threads ?? []).map((t) => <option key={t.id} value={t.id}>{t.subject} · {t.channel}</option>)}</select>
            <input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Recipient email(s), separated by commas" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            <input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Draft subject" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
            <textarea required className="min-h-32 rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Draft message" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
            <button className="w-fit rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={saveDraft.isPending}>Save unsent draft</button>
          </form>
        </section>
        {notice ? <p role="status" className="rounded-xl border border-line p-3 text-sm">{notice}</p> : null}
      </div>
    </BridgeShell>
  );
}
