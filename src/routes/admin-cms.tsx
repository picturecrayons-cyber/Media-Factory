import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import {
  getPublicSiteContent, getHomepageDraft, updateHomepageContent,
  approveHomepageDraft, publishHomepageDraft, getHomepageVersions, restoreHomepageVersion,
} from "@/lib/bridge/site-content";

export const Route = createFileRoute("/admin-cms")({ component: BridgeCms });

function BridgeCms() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Website CMS">
            {isAdmin ? <CmsEditor isSuperAdmin={actor.internalRole === "super_admin"} /> : (
              <section className="rounded-3xl border border-line bg-surface p-8">
                <h2 className="font-display text-2xl font-semibold">Admin access required</h2>
                <p className="mt-2 text-sm text-muted">Public website content is restricted to Bridge administrators.</p>
              </section>
            )}
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function CmsEditor({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const contentQ = useQuery({ queryKey: ["bridge-site-content"], queryFn: () => getPublicSiteContent() });
  const draftQ = useQuery({ queryKey: ["bridge-site-content-draft"], queryFn: () => getHomepageDraft() });
  const historyQ = useQuery({ queryKey: ["bridge-site-content-history"], queryFn: () => getHomepageVersions() });
  const [form, setForm] = useState({
    heroTitle: "", heroBody: "", workflowHeading: "", audienceHeading: "", finalCtaHeading: "",
  });
  const [saving, setSaving] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const source = draftQ.data?.draft ?? contentQ.data;
    if (!source) return;
    setForm({
      heroTitle: source.heroTitle,
      heroBody: source.heroBody,
      workflowHeading: source.workflowHeading,
      audienceHeading: source.audienceHeading,
      finalCtaHeading: source.finalCtaHeading,
    });
  }, [contentQ.data, draftQ.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateHomepageContent({ data: form });
      await draftQ.refetch();
      setStatus("Draft saved. The public homepage has not changed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save homepage draft.");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setWorkflowBusy(true);
    setStatus(null);
    try {
      await approveHomepageDraft();
      await draftQ.refetch();
      setStatus("Draft approved. Publishing remains a separate action.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function restore(version: number) {
    setWorkflowBusy(true);
    setStatus(null);
    try {
      await restoreHomepageVersion({ data: { version } });
      await Promise.all([draftQ.refetch(), historyQ.refetch()]);
      setStatus("Selected version restored as a new draft. Review and approve it before publishing.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Version restore failed.");
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function publish() {
    setWorkflowBusy(true);
    setStatus(null);
    try {
      await publishHomepageDraft();
      await Promise.all([draftQ.refetch(), contentQ.refetch(), historyQ.refetch()]);
      setStatus("Approved homepage version published.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publishing failed.");
    } finally {
      setWorkflowBusy(false);
    }
  }

  if (contentQ.isPending || draftQ.isPending) return <p className="text-sm text-muted">Loading website content…</p>;
  if (contentQ.isError || draftQ.isError) return <p className="text-sm text-accent">Website CMS is unavailable until its approved database migration is applied.</p>;

  const fields = [
    ["heroTitle", "Hero title", 120],
    ["heroBody", "Hero description", 280],
    ["workflowHeading", "Workflow heading", 100],
    ["audienceHeading", "Audience heading", 100],
    ["finalCtaHeading", "Final CTA heading", 120],
  ] as const;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={(e) => void save(e)} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Public website · Homepage Builder</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">Edit homepage content</h2>
        <p className="mt-2 text-sm text-muted">Save creates a draft only. Preview it, approve it, then publish as a separate action. Authentication, roles and operational workflows are outside this CMS.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-line px-3 py-1">State: {draftQ.data.workflowState}</span>
          <span className="rounded-full border border-line px-3 py-1">Draft v{draftQ.data.draftVersion}</span>
          <span className="rounded-full border border-line px-3 py-1">Published v{draftQ.data.publishedVersion}</span>
        </div>
        <div className="mt-7 space-y-5">
          {fields.map(([key, label, max]) => (
            <label key={key} className="block text-sm font-medium">
              {label}
              {key === "heroBody" ? (
                <textarea required maxLength={max} rows={4} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="mt-2 w-full rounded-xl border border-line-strong bg-elevated px-3 py-3" />
              ) : (
                <input required maxLength={max} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3" />
              )}
            </label>
          ))}
        </div>
        {preview ? (
          <section className="mt-7 rounded-2xl border border-line bg-elevated p-5" aria-label="Homepage draft preview">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Draft preview · not public</p>
            <h3 className="mt-3 font-display text-3xl font-semibold">{form.heroTitle}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{form.heroBody}</p>
            <h4 className="mt-7 font-display text-xl font-semibold">{form.workflowHeading}</h4>
            <h4 className="mt-6 font-display text-xl font-semibold">{form.audienceHeading}</h4>
            <h4 className="mt-6 font-display text-xl font-semibold">{form.finalCtaHeading}</h4>
          </section>
        ) : null}
        {status ? <p role="status" className="mt-5 text-sm text-muted">{status}</p> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</Button>
          <Button type="button" variant="outline" onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Preview draft"}</Button>
          {isSuperAdmin ? (
            <>
              <Button type="button" variant="outline" disabled={workflowBusy || draftQ.data.workflowState !== "DRAFT"} onClick={() => void approve()}>Approve draft</Button>
              <Button type="button" disabled={workflowBusy || draftQ.data.workflowState !== "APPROVED"} onClick={() => void publish()}>Publish approved version</Button>
            </>
          ) : null}
          <a href="/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline">Open public site ↗</a>
        </div>
      </form>
      <aside className="space-y-3">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold">CMS workflow</h3>
          <ol className="mt-3 space-y-3 text-sm text-muted">
            <li><strong className="text-fg">1. Draft</strong><br />Edit and save content without changing the public website.</li>
            <li><strong className="text-fg">2. Preview</strong><br />Check the draft before approval.</li>
            <li><strong className="text-fg">3. Approval</strong><br />Super Admin records the approval decision.</li>
            <li><strong className="text-fg">4. Publish</strong><br />Only an approved version can be published.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold">Publish history</h3>
          <p className="mt-2 text-sm text-muted">Recent saved versions. Restore creates a new draft; it never rolls back the public site directly.</p>
          <ul className="mt-3 divide-y divide-line">
            {(historyQ.data ?? []).map((item) => (
              <li key={item.version_number} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span>v{item.version_number} · {item.status}</span>
                {isSuperAdmin ? <Button type="button" size="sm" variant="outline" disabled={workflowBusy} onClick={() => void restore(item.version_number)}>Restore as draft</Button> : null}
              </li>
            ))}
            {!historyQ.isPending && !historyQ.isError && !(historyQ.data ?? []).length ? <li className="py-3 text-xs text-muted">No saved versions yet.</li> : null}
            {historyQ.isError ? <li className="py-3 text-xs text-muted">Version history unavailable until the CMS migration is applied.</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h3 className="font-semibold">Other CMS modules</h3>
          <p className="mt-2 text-sm text-muted">Media Library, Featured Catalogue, Campaigns, Pages & FAQ, SEO & Social, Analytics and full version rollback remain to be implemented. They are not represented as working controls yet.</p>
        </section>
      </aside>
    </div>
  );
}
