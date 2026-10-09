import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveDistributionDraft,
  createDistributionInquiry,
  listDistributionInquiries,
  saveDistributionDraft,
} from "@/lib/bridge/distribution-desk";

export const Route = createFileRoute("/distribution-desk")({
  component: DistributionDeskPage,
});

function DistributionDeskPage() {
  const queryClient = useQueryClient();
  const [sourceReference, setSourceReference] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [titleId, setTitleId] = useState("");
  const [inquiryText, setInquiryText] = useState("");
  const [error, setError] = useState("");

  const inquiries = useQuery({
    queryKey: ["bridge-distribution-inquiries"],
    queryFn: () => listDistributionInquiries({ data: { limit: 50 } }),
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bridge-distribution-inquiries"] });
  const create = useMutation({
    mutationFn: () => createDistributionInquiry({
      data: {
        sourceReference, buyerName, buyerEmail, inquiryText, titleId: titleId.trim() || null,
        requestSummary: {},
      },
    }),
    onSuccess: () => {
      setError("");
      setSourceReference(""); setBuyerName(""); setBuyerEmail(""); setTitleId(""); setInquiryText("");
      void refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not record inquiry"),
  });
  const save = useMutation({
    mutationFn: (draft: { inquiryId: string; draftSubject: string; draftBody: string }) =>
      saveDistributionDraft({ data: draft }),
    onSuccess: () => { setError(""); void refresh(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save draft"),
  });
  const approve = useMutation({
    mutationFn: (inquiryId: string) => approveDistributionDraft({
      data: { inquiryId, explicitApproval: true },
    }),
    onSuccess: () => { setError(""); void refresh(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not approve draft"),
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Crayons Bridge · Internal</p>
        <h1 className="font-display text-3xl font-semibold text-fg">Distribution Desk</h1>
        <p className="max-w-3xl text-sm text-muted">
          Record an inquiry, prepare a cautious response, edit it, and explicitly approve the draft.
          This first milestone has no mailbox listener and cannot send email.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-fg">Record buyer inquiry</h2>
        <p className="mb-4 mt-1 text-xs text-muted">Enter a stable source reference (for example, an email message ID). Duplicate references are rejected.</p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <label className="space-y-1 text-sm text-muted">Source reference
            <input required value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-fg" maxLength={500} />
          </label>
          <label className="space-y-1 text-sm text-muted">Buyer name
            <input required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-fg" maxLength={160} />
          </label>
          <label className="space-y-1 text-sm text-muted">Buyer email
            <input required type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-fg" maxLength={320} />
          </label>
          <label className="space-y-1 text-sm text-muted">Bridge title ID (optional)
            <input value={titleId} onChange={(e) => setTitleId(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-fg" maxLength={160} placeholder="Use an existing Bridge title ID" />
          </label>
          <label className="space-y-1 text-sm text-muted md:col-span-2">Inquiry text
            <textarea required value={inquiryText} onChange={(e) => setInquiryText(e.target.value)} className="min-h-28 w-full rounded-lg border border-line bg-elevated p-3 text-fg" maxLength={12000} />
          </label>
          <div className="md:col-span-2">
            <button disabled={create.isPending} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50" type="submit">
              {create.isPending ? "Recording…" : "Record inquiry and create draft"}
            </button>
          </div>
        </form>
      </section>

      {error ? <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-400">{error}</p> : null}
      {inquiries.isLoading ? <p className="text-sm text-muted">Loading inquiries…</p> : null}
      {inquiries.isError ? <p role="alert" className="rounded-lg border border-line p-3 text-sm text-muted">The desk is restricted to verified Bridge legal/licensing staff. If you have that role, check the error and access configuration.</p> : null}

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-fg">Inquiry and draft queue</h2>
        {inquiries.data?.inquiries.map((item) => (
          <InquiryDraft key={item.id} item={item}
            saving={save.isPending} approving={approve.isPending}
            onSave={(draftSubject, draftBody) => save.mutate({ inquiryId: item.id, draftSubject, draftBody })}
            onApprove={() => {
              if (window.confirm("Approve this draft record? No email will be sent.")) approve.mutate(item.id);
            }}
          />
        ))}
        {inquiries.data && inquiries.data.inquiries.length === 0 ? <p className="rounded-xl border border-line p-5 text-sm text-muted">No inquiries recorded yet.</p> : null}
      </section>
    </main>
  );
}

function InquiryDraft({ item, saving, approving, onSave, onApprove }: {
  item: {
    id: string; source_reference: string; buyer_name: string; buyer_email: string; inquiry_text: string;
    title_name: string | null; draft_subject: string; draft_body: string; status: string;
    created_at: string; reviewed_at: string | null;
  };
  saving: boolean; approving: boolean;
  onSave: (subject: string, body: string) => void; onApprove: () => void;
}) {
  const [subject, setSubject] = useState(item.draft_subject);
  const [body, setBody] = useState(item.draft_body);
  const locked = item.status === "APPROVED_DRAFT";
  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-fg">{item.buyer_name} <span className="font-normal text-muted">· {item.buyer_email}</span></h3>
          <p className="mt-1 text-xs text-muted">Source: {item.source_reference} · {item.title_name ?? "Title not matched"} · {new Date(item.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{item.status}</span>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted">View original inquiry</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-elevated p-3 text-xs text-fg">{item.inquiry_text}</pre>
      </details>
      <div className="space-y-2">
        <label className="block space-y-1 text-xs font-semibold text-muted">Draft subject
          <input disabled={locked} value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm font-normal text-fg disabled:opacity-60" maxLength={300} />
        </label>
        <label className="block space-y-1 text-xs font-semibold text-muted">Draft body
          <textarea disabled={locked} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-44 w-full rounded-lg border border-line bg-elevated p-3 text-sm font-normal text-fg disabled:opacity-60" maxLength={12000} />
        </label>
        <p className="text-xs text-muted">No availability, price, territory, licensing term or screener is confirmed in the generated draft. Verify evidence before editing in any such claim.</p>
        {!locked ? <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => onSave(subject, body)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-fg disabled:opacity-50">Save draft</button>
          <button type="button" disabled={approving || !subject.trim() || !body.trim()} onClick={onApprove} className="rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">Approve draft record — no email sent</button>
        </div> : <p className="text-xs text-muted">Approved by {item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : "authorized reviewer"}. Approval records review only; no message was sent.</p>}
      </div>
    </article>
  );
}
