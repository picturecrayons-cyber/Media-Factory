import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { getPublicSiteContent, updateHomepageCarousel, updateHomepageContent } from "@/lib/bridge/site-content";

type Slide = { imageUrl: string; alt: string; caption: string };

export const Route = createFileRoute("/admin-cms")({ component: BridgeCms });

function BridgeCms() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Website CMS">
            {isAdmin ? <CmsEditor canEditCarousel={actor.internalRole === "super_admin"} /> : (
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

function CmsEditor({ canEditCarousel }: { canEditCarousel: boolean }) {
  const contentQ = useQuery({ queryKey: ["bridge-site-content"], queryFn: () => getPublicSiteContent() });
  const [form, setForm] = useState({
    heroTitle: "", heroBody: "", workflowHeading: "", audienceHeading: "", finalCtaHeading: "",
  });
  const [slides, setSlides] = useState<Slide[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingSlides, setSavingSlides] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [slideStatus, setSlideStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!contentQ.data) return;
    setForm({
      heroTitle: contentQ.data.heroTitle,
      heroBody: contentQ.data.heroBody,
      workflowHeading: contentQ.data.workflowHeading,
      audienceHeading: contentQ.data.audienceHeading,
      finalCtaHeading: contentQ.data.finalCtaHeading,
    });
    setSlides(contentQ.data.carouselSlides ?? []);
  }, [contentQ.data]);

  async function saveCopy(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateHomepageContent({ data: form });
      await contentQ.refetch();
      setStatus("Homepage copy saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save homepage copy.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCarousel(e: FormEvent) {
    e.preventDefault();
    setSavingSlides(true);
    setSlideStatus(null);
    try {
      await updateHomepageCarousel({ data: { slides } });
      await contentQ.refetch();
      setSlideStatus("Carousel saved. The public homepage will show the updated slides.");
    } catch (error) {
      setSlideStatus(error instanceof Error ? error.message : "Carousel could not be saved. Confirm the STAGING migration is applied.");
    } finally {
      setSavingSlides(false);
    }
  }

  if (contentQ.isPending) return <p className="text-sm text-muted">Loading website content…</p>;
  if (contentQ.isError) return <p role="alert" className="text-sm text-accent">Website CMS is unavailable. Check the configured database target and CMS migration status.</p>;

  const fields = [
    ["heroTitle", "Hero title", 120],
    ["heroBody", "Hero description", 280],
    ["workflowHeading", "Workflow heading", 100],
    ["audienceHeading", "Audience heading", 100],
    ["finalCtaHeading", "Final CTA heading", 120],
  ] as const;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)]">
      <form onSubmit={(e) => void saveCopy(e)} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Public website</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">Homepage copy</h2>
        <p className="mt-2 text-sm text-muted">Edit public-facing copy only. Brand identity, workflow logic, authentication and operational claims remain code-controlled.</p>
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save homepage copy"}</Button>
          <a href="/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline">View public site ↗</a>
        </div>
      </form>

      <form onSubmit={(e) => void saveCarousel(e)} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Homepage media</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Hero image carousel</h2>
        <p className="mt-2 text-sm text-muted">Add up to five secure HTTPS image URLs. Each slide needs meaningful alt text. Use images hosted in an approved public media location.</p>
        {!canEditCarousel ? (
          <p className="mt-4 rounded-xl border border-line bg-elevated p-3 text-sm text-muted">View only. Carousel image management is reserved for the designated Super Admin.</p>
        ) : null}
        <div className="mt-5 space-y-4">
          {slides.map((slide, index) => (
            <div key={index} className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Slide {index + 1}</h3>
                {canEditCarousel ? <button type="button" onClick={() => setSlides((v) => v.filter((_, i) => i !== index))} className="text-xs font-semibold text-muted hover:text-red-500">Remove</button> : null}
              </div>
              <label className="block text-xs font-semibold text-muted">
                Image URL (HTTPS)
                <input disabled={!canEditCarousel} type="url" required value={slide.imageUrl} onChange={(e) => setSlides((v) => v.map((item, i) => i === index ? { ...item, imageUrl: e.target.value } : item))} placeholder="https://…/homepage-image.jpg" className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg disabled:opacity-60" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-muted">
                Image alt text
                <input disabled={!canEditCarousel} required minLength={5} maxLength={160} value={slide.alt} onChange={(e) => setSlides((v) => v.map((item, i) => i === index ? { ...item, alt: e.target.value } : item))} placeholder="Describe the image for accessibility" className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg disabled:opacity-60" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-muted">
                Caption (optional)
                <input disabled={!canEditCarousel} maxLength={120} value={slide.caption} onChange={(e) => setSlides((v) => v.map((item, i) => i === index ? { ...item, caption: e.target.value } : item))} placeholder="Short caption" className="mt-1 h-10 w-full rounded-xl border border-line bg-elevated px-3 text-sm text-fg disabled:opacity-60" />
              </label>
              {slide.imageUrl.startsWith("https://") ? <img src={slide.imageUrl} alt={slide.alt || "Carousel preview"} loading="lazy" className="mt-3 aspect-video w-full rounded-xl border border-line object-cover" /> : null}
            </div>
          ))}
          {!slides.length ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No carousel slides added yet.</p> : null}
        </div>
        {canEditCarousel ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={slides.length >= 5} onClick={() => setSlides((v) => [...v, { imageUrl: "", alt: "", caption: "" }])}>+ Add image</Button>
            <Button type="submit" disabled={savingSlides || slides.some((s) => !s.imageUrl || !s.alt.trim())}>{savingSlides ? "Saving carousel…" : "Save carousel"}</Button>
          </div>
        ) : null}
        {slideStatus ? <p role="status" className="mt-4 text-sm text-muted">{slideStatus}</p> : null}
        <p className="mt-4 text-xs text-muted">No file is uploaded by this form. It stores image references only; no Storage bucket, object or production asset is changed.</p>
      </form>
    </div>
  );
}
