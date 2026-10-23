import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  createBuyerProspect,
  advanceBuyerProspectStage,
  verifyBuyerProspect,
  listBuyerProspects,
  listMyBridgeNotifications,
  listUnlinkedHostingerEvents,
  linkBuyerCommunicationThread,
  listMyBuyerCommunicationThreads,
  listMyBuyerCommunicationMessages,
  prepareBuyerMailDraft,
  sendConfirmedBuyerMailDraft,
} from "@/lib/bridge/communications";

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
  const [viewThreadId, setViewThreadId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [savedDraftId, setSavedDraftId] = useState("");
  const [sendConfirmationText, setSendConfirmationText] = useState("");
  const [notice, setNotice] = useState("");
  const [nextStages, setNextStages] = useState<Record<string, string>>({});
  const [verificationRefs, setVerificationRefs] = useState<Record<string, string>>({});

  const prospectsQ = useQuery({ queryKey: ["bridge-buyer-prospects"], queryFn: () => listBuyerProspects() });
  const threadsQ = useQuery({ queryKey: ["bridge-my-communication-threads"], queryFn: () => listMyBuyerCommunicationThreads({ data: {} }) });
  const messagesQ = useQuery({ queryKey: ["bridge-thread-messages", viewThreadId], queryFn: () => listMyBuyerCommunicationMessages({ data: { threadId: viewThreadId } }), enabled: Boolean(viewThreadId) });
  const notificationsQ = useQuery({ queryKey: ["bridge-my-notifications"], queryFn: () => listMyBridgeNotifications() });
  const unlinkedEventsQ = useQuery({ queryKey: ["bridge-unlinked-hostinger-events"], queryFn: () => listUnlinkedHostingerEvents(), enabled: actor.internalRole === "super_admin" });

  const createProspect = useMutation({
    mutationFn: () => createBuyerProspect({ data: { companyName, companyDomain: domain || undefined, contactName: contactName || undefined, contactEmail: email || undefined, source } }),
    onSuccess: (result) => { setNotice("Prospect saved as UNVERIFIED."); setProspectId(result.id); setCompanyName(""); setDomain(""); setContactName(""); setEmail(""); void client.invalidateQueries({ queryKey: ["bridge-buyer-prospects"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save prospect."),
  });
  const advanceStage = useMutation({
    mutationFn: (input: { prospectId: string; stage: string }) => advanceBuyerProspectStage({ data: { prospectId: input.prospectId, stage: input.stage as "DISCOVERED" | "RESEARCHING" | "CONTACT_READY" | "ENQUIRY" | "IN_NEGOTIATION" | "CONTRACT_REVIEW" | "CONTRACTED" | "DECLINED" | "DORMANT" } }),
    onSuccess: (result) => { setNotice(`Pipeline updated: ${result.from} → ${result.stage}`); void client.invalidateQueries({ queryKey: ["bridge-buyer-prospects"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not advance pipeline."),
  });
  const verifyProspect = useMutation({
    mutationFn: (input: { prospectId: string; legalReference: string; verificationStatus: "VERIFIED_BUYER" | "CONTRACTED_PARTNER" }) => verifyBuyerProspect({ data: input }),
    onSuccess: (result) => { setNotice(`Buyer verification recorded: ${result.verificationStatus}`); void client.invalidateQueries({ queryKey: ["bridge-buyer-prospects"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not verify buyer."),
  });
  const linkThread = useMutation({
    mutationFn: () => linkBuyerCommunicationThread({ data: { prospectId, subject, channel, externalThreadId: externalThreadId || undefined, mailboxAccountRef: mailboxAccountRef || undefined } }),
    onSuccess: (result) => { setNotice("Thread link saved. No email was sent."); setThreadId(result.id); setSubject(""); void client.invalidateQueries({ queryKey: ["bridge-my-communication-threads"] }); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not link thread."),
  });
  const sendDraft = useMutation({
    mutationFn: () => sendConfirmedBuyerMailDraft({ data: { draftId: savedDraftId, confirmationText: "SEND EMAIL" } }),
    onSuccess: (result) => { setNotice(`Email sent and audited. Message ID: ${result.externalMessageId}`); setSavedDraftId(""); setSendConfirmationText(""); },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Email send failed. Reconcile the Sent mailbox before retrying."),
  });
  const saveDraft = useMutation({
    mutationFn: () => prepareBuyerMailDraft({ data: { threadId, idempotencyKey: `draft-${threadId}-${draftSubject.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, recipients: recipients.split(/[;,\n]/).map((v) => v.trim()).filter(Boolean), subject: draftSubject, bodyText } }),
    onSuccess: (result) => { setNotice("Draft saved to the Bridge outbox. It has not been sent."); setSavedDraftId(result.id); setSendConfirmationText(""); setDraftSubject(""); setBodyText(""); },
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
              <thead><tr className="border-b border-line text-xs text-muted"><th className="p-2">Company</th><th className="p-2">Contact</th><th className="p-2">Pipeline</th><th className="p-2">Verification</th><th className="p-2">Use</th><th className="p-2">Advance pipeline</th><th className="p-2">Verification evidence</th></tr></thead>
              <tbody className="divide-y divide-line">
                {(prospectsQ.data?.prospects ?? []).map((p) => <tr key={p.id}><td className="p-2"><div className="font-medium">{p.company_name}</div><div className="text-xs text-muted">{p.company_domain ?? "No domain"}</div></td><td className="p-2">{p.contact_name ?? "—"}<div className="text-xs text-muted">{p.contact_email ?? ""}</div></td><td className="p-2">{p.pipeline_stage}</td><td className="p-2">{p.verification_status}</td><td className="p-2"><button className="underline" type="button" onClick={() => setProspectId(p.id)}>Link thread</button></td><td className="p-2"><div className="flex gap-2"><select aria-label={`Next stage for ${p.company_name}`} className="rounded border border-line bg-transparent px-2 py-1 text-xs" value={nextStages[p.id] ?? ""} onChange={(e) => setNextStages((prev) => ({ ...prev, [p.id]: e.target.value }))}><option value="">Choose stage</option>{["RESEARCHING", "CONTACT_READY", "ENQUIRY", "IN_NEGOTIATION", "CONTRACT_REVIEW", "CONTRACTED", "DECLINED", "DORMANT"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select><button type="button" className="underline disabled:opacity-50" disabled={!nextStages[p.id] || advanceStage.isPending} onClick={() => advanceStage.mutate({ prospectId: p.id, stage: nextStages[p.id] })}>Save</button></div></td><td className="p-2"><div className="flex min-w-56 flex-col gap-2"><input aria-label={`Verification evidence for ${p.company_name}`} className="rounded border border-line bg-transparent px-2 py-1 text-xs" placeholder="Contract / legal reference" value={verificationRefs[p.id] ?? ""} onChange={(e) => setVerificationRefs((prev) => ({ ...prev, [p.id]: e.target.value }))} />{actor.internalRole === "super_admin" ? <div className="flex flex-wrap gap-2"><button type="button" className="underline disabled:opacity-50" disabled={(verificationRefs[p.id] ?? "").trim().length < 3 || verifyProspect.isPending} onClick={() => verifyProspect.mutate({ prospectId: p.id, legalReference: verificationRefs[p.id] ?? "", verificationStatus: "VERIFIED_BUYER" })}>Verify buyer</button>{p.pipeline_stage === "CONTRACT_REVIEW" ? <button type="button" className="underline disabled:opacity-50" disabled={(verificationRefs[p.id] ?? "").trim().length < 3 || verifyProspect.isPending} onClick={() => verifyProspect.mutate({ prospectId: p.id, legalReference: verificationRefs[p.id], verificationStatus: "CONTRACTED_PARTNER" })}>Contracted partner</button> : null}</div> : <span className="text-xs text-muted">Super Admin approval required</span>}</div></td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">My Bridge notifications</h2>
          <p className="mt-1 text-sm text-muted">Persisted events for your account. Duplicate pipeline events are guarded by a deduplication key.</p>
          <ul className="mt-3 divide-y divide-line">
            {(notificationsQ.data?.notifications ?? []).slice(0, 10).map((item) => <li key={item.id} className="py-2 text-sm"><span className="font-medium">{item.event_type.replaceAll("_", " ")}</span><span className="ml-2 text-xs text-muted">{item.entity_type}:{item.entity_id}</span></li>)}
            {!notificationsQ.isPending && !notificationsQ.isError && !(notificationsQ.data?.notifications ?? []).length ? <li className="py-3 text-sm text-muted">No notifications yet.</li> : null}
            {notificationsQ.isError ? <li className="py-3 text-sm text-muted">Notifications unavailable. Confirm staging migration is applied.</li> : null}
          </ul>
        </section>

        {actor.internalRole === "super_admin" ? <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Incoming Hostinger Mail events</h2>
          <p className="mt-1 text-sm text-muted">Authenticated webhook metadata awaiting a prospect/thread link. No automatic buyer account or reply is created.</p>
          {unlinkedEventsQ.isError ? <p className="mt-3 text-sm text-muted">Webhook events unavailable. Confirm migration and webhook configuration.</p> : null}
          <ul className="mt-3 divide-y divide-line">
            {(unlinkedEventsQ.data?.events ?? []).map((event) => <li key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{event.subject ?? "(no subject)"}</p>
                <p className="text-xs text-muted">{event.sender_ref ?? "Unknown sender"} · {event.mailbox_ref} · {event.received_at}</p>
                <p className="mt-1 text-sm">{event.preview_text ?? "No preview supplied by webhook."}</p>
                <p className="mt-1 break-all text-xs text-muted">Thread: {event.external_thread_id}</p>
              </div>
              <button type="button" className="shrink-0 underline" onClick={() => { setChannel("HOSTINGER_MAIL"); setExternalThreadId(event.external_thread_id); setMailboxAccountRef(event.mailbox_ref); setSubject(event.subject ?? "(no subject)"); setProspectId(""); }}>Link to prospect</button>
            </li>)}
            {!unlinkedEventsQ.isPending && !unlinkedEventsQ.isError && !(unlinkedEventsQ.data?.events ?? []).length ? <li className="py-3 text-sm text-muted">No unlinked events.</li> : null}
          </ul>
        </section> : null}

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Link a conversation</h2>
          <p className="mt-1 text-sm text-muted">Links an existing Hostinger Mail thread to a prospect. This does not fetch mail from Hostinger or send anything.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); linkThread.mutate(); }}>
            <select required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={prospectId} onChange={(e) => setProspectId(e.target.value)}><option value="">Choose prospect</option>{(prospectsQ.data?.prospects ?? []).map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}</select>
            <input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Thread subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <select className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}><option value="HOSTINGER_MAIL">Hostinger Mail</option><option value="BRIDGE_INTERNAL">Bridge internal</option><option value="OTHER">Other</option></select>
            {channel === "HOSTINGER_MAIL" ? <><input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Exact Hostinger thread ID" value={externalThreadId} onChange={(e) => setExternalThreadId(e.target.value)} /><input required className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm" placeholder="Exact mailbox address configured in Hostinger webhook" value={mailboxAccountRef} onChange={(e) => setMailboxAccountRef(e.target.value)} /></> : null}
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={linkThread.isPending}>Save thread link</button>
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-semibold">Conversation history</h2>
          <p className="mt-1 text-sm text-muted">History is scoped to threads linked by your operator account. Webhook previews may be truncated by the mailbox provider.</p>
          <select className="mt-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={viewThreadId} onChange={(e) => setViewThreadId(e.target.value)}>
            <option value="">Choose a linked thread</option>
            {(threadsQ.data?.threads ?? []).map((t) => <option key={t.id} value={t.id}>{t.subject} · {t.channel}</option>)}
          </select>
          {messagesQ.isError ? <p className="mt-3 text-sm text-muted">Conversation history unavailable for this thread.</p> : null}
          <ol className="mt-3 space-y-3">
            {(messagesQ.data?.messages ?? []).map((message) => <li key={message.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{message.direction.replaceAll("_", " ")} · {message.sender_ref ?? "Internal"}</span><span>{message.sent_at ?? message.created_at}</span></div>
              {message.subject ? <p className="mt-1 font-medium">{message.subject}</p> : null}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body_text ?? "(No body stored)"}</p>
            </li>)}
            {viewThreadId && !messagesQ.isPending && !messagesQ.isError && !(messagesQ.data?.messages ?? []).length ? <li className="text-sm text-muted">No messages recorded for this thread yet.</li> : null}
          </ol>
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
          {savedDraftId ? <div className="mt-5 rounded-xl border border-line p-4">
            <h3 className="font-semibold">Explicit send confirmation</h3>
            <p className="mt-1 text-sm text-muted">Draft ID: {savedDraftId}. This action sends an external email through configured SMTP. Confirm the recipient above is correct. Sending is limited to the contact email recorded on the linked prospect. Ambiguous SMTP outcomes are never retried automatically.</p>
            <label className="mt-3 block text-sm" htmlFor="send-confirmation">Type SEND EMAIL to confirm</label>
            <input id="send-confirmation" className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm" value={sendConfirmationText} onChange={(e) => setSendConfirmationText(e.target.value)} placeholder="SEND EMAIL" />
            {actor.internalRole === "super_admin" ? <button type="button" className="mt-3 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50" disabled={sendConfirmationText !== "SEND EMAIL" || sendDraft.isPending} onClick={() => sendDraft.mutate()}>Send confirmed email</button> : <p className="mt-3 text-sm text-muted">Only Super Admin can send external email.</p>}
          </div> : null}
        </section>
        {notice ? <p role="status" className="rounded-xl border border-line p-3 text-sm">{notice}</p> : null}
      </div>
    </BridgeShell>
  );
}
