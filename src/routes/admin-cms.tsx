import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getPublicSiteContent, updateHomepageContent } from "@/lib/bridge/site-content";

export const Route = createFileRoute("/admin-cms")({ component: BridgeCms });

function BridgeCms() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Website CMS">
            {isAdmin ? <CmsEditor /> : (
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

function CmsEditor() {
  const contentQ = useQuery({ queryKey: ["bridge-site-content"], queryFn: () => getPublicSiteContent() });
  const [form, setForm] = useState({
    heroTitle: "", heroBody: "", workflowHeading: "", audienceHeading: "", finalCtaHeading: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!contentQ.data) return;
    setForm({
      heroTitle: contentQ.data.heroTitle,
      heroBody: contentQ.data.heroBody,
      workflowHeading: contentQ.data.workflowHeading,
      audienceHeading: contentQ.data.audienceHeading,
      finalCtaHeading: contentQ.data.finalCtaHeading,
    });
  }, [contentQ.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateHomepageContent({ data: form });
      await contentQ.refetch();
      setStatus("Homepage content saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save homepage content.");
    } finally {
      setSaving(false);
    }
  }

  if (contentQ.isPending) return <p className="text-sm text-muted">Loading website content…</p>;
  if (contentQ.isError) return <p className="text-sm text-accent">Website CMS is unavailable until its database migration is applied.</p>;

  const fields = [
    ["heroTitle", "Hero title", 120],
    ["heroBody", "Hero description", 280],
    ["workflowHeading", "Workflow heading", 100],
    ["audienceHeading", "Audience heading", 100],
    ["finalCtaHeading", "Final CTA heading", 120],
  ] as const;

  return (
    <form onSubmit={(e) => void save(e)} className="max-w-3xl rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Public website</p>
      <h2 className="mt-1 font-display text-3xl font-semibold">Homepage content</h2>
      <p className="mt-2 text-sm text-muted">Minimal copy controls only. Brand, workflow logic, auth and operational claims remain code-controlled.</p>
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
      {status ? <p role="status" className="mt-5 text-sm text-muted">{status}</p> : null}
      <div className="mt-6 flex items-center gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save homepage"}</Button>
        <a href="/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline">View public site ↗</a>
      </div>
    </form>
  );
}
