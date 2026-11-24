import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/brand-settings")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: BrandSettings,
});

type LogoPreview = { name: string; url: string } | null;

const DEFAULTS = {
  accent: "#3B82F6",
  background: "#0B1220",
  surface: "#111C2E",
  foreground: "#F8FAFC",
};

function BrandSettings() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        const isAdmin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
        return (
          <BridgeShell actor={actor} title="Brand settings">
            {isAdmin ? <BrandPreviewLab /> : (
              <section className="rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-display text-xl font-semibold">Admin access required</h2>
                <p className="mt-2 text-sm text-muted">Brand configuration is restricted to Bridge administrators.</p>
              </section>
            )}
          </BridgeShell>
        );
      }}
    </RequireBridge>
  );
}

function BrandPreviewLab() {
  const [accent, setAccent] = useState(DEFAULTS.accent);
  const [background, setBackground] = useState(DEFAULTS.background);
  const [surface, setSurface] = useState(DEFAULTS.surface);
  const [foreground, setForeground] = useState(DEFAULTS.foreground);
  const [lightLogo, setLightLogo] = useState<LogoPreview>(null);
  const [darkLogo, setDarkLogo] = useState<LogoPreview>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (lightLogo?.url) URL.revokeObjectURL(lightLogo.url);
    };
  }, [lightLogo]);

  useEffect(() => {
    return () => {
      if (darkLogo?.url) URL.revokeObjectURL(darkLogo.url);
    };
  }, [darkLogo]);

  function selectLogo(event: ChangeEvent<HTMLInputElement>, mode: "light" | "dark") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setError("Choose a PNG, JPEG, WebP or SVG logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Logo files must be 5 MB or smaller.");
      return;
    }
    setError(null);
    const next = { name: file.name, url: URL.createObjectURL(file) };
    if (mode === "light") setLightLogo(next);
    else setDarkLogo(next);
  }

  function resetPreview() {
    setAccent(DEFAULTS.accent);
    setBackground(DEFAULTS.background);
    setSurface(DEFAULTS.surface);
    setForeground(DEFAULTS.foreground);
    setLightLogo(null);
    setDarkLogo(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Bridge · Preview-only design workspace</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Brand settings</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Explore light and dark logo treatments and core colour tokens before a persisted brand configuration is introduced.
          This editor is intentionally local-only: it does not upload files, save settings, change the live site or modify LOOP branding.
        </p>
        <p className="mt-3 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted">
          PREVIEW ONLY · NOT SAVED · NO PRODUCTION EFFECT
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section className="space-y-5 rounded-2xl border border-line bg-surface p-5">
          <div>
            <h3 className="font-semibold">Logo previews</h3>
            <p className="mt-1 text-xs text-muted">Files remain in this browser session and are not uploaded.</p>
          </div>
          <LogoPicker label="Light-background logo" value={lightLogo} onChange={(event) => selectLogo(event, "light")} />
          <LogoPicker label="Dark-background logo" value={darkLogo} onChange={(event) => selectLogo(event, "dark")} />
          <div className="border-t border-line pt-5">
            <h3 className="font-semibold">Colour tokens</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ColourPicker label="Accent" value={accent} onChange={setAccent} />
              <ColourPicker label="Background" value={background} onChange={setBackground} />
              <ColourPicker label="Surface" value={surface} onChange={setSurface} />
              <ColourPicker label="Foreground" value={foreground} onChange={setForeground} />
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
          <Button type="button" variant="outline" onClick={resetPreview}>Reset local preview</Button>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="font-semibold">Live appearance preview</h3>
            <p className="mt-1 text-xs text-muted">Illustrative component preview only; the application theme is unchanged.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line" style={{ backgroundColor: background, color: foreground }}>
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-5">
              <BrandLogo logo={darkLogo} fallback="CRAYONS BRIDGE" />
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: accent, color: background }}>Preview</span>
            </div>
            <div className="space-y-4 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>StreamVista OPC Pvt Ltd</p>
              <h4 className="max-w-xl text-3xl font-semibold">Prepare. Protect. License. Deliver.</h4>
              <p className="max-w-xl text-sm opacity-75">A consistent visual identity across the Bridge workspace, public website and operational surfaces.</p>
              <div className="rounded-xl border border-white/10 p-5" style={{ backgroundColor: surface }}>
                <div className="flex items-center justify-between gap-3">
                  <strong>Brand component</strong>
                  <span className="text-xs opacity-70">Sample card</span>
                </div>
                <div className="mt-4 h-2 w-2/3 rounded-full" style={{ backgroundColor: accent }} />
                <div className="mt-2 h-2 w-1/2 rounded-full bg-white/20" />
                <button type="button" className="mt-5 rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: accent, color: background }}>Primary action</button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-white p-4 text-slate-900">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Light logo treatment</p>
              <BrandLogo logo={lightLogo} fallback="CRAYONS BRIDGE" />
            </div>
            <div className="rounded-xl border border-line p-4" style={{ backgroundColor: "#111827", color: "#F9FAFB" }}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Dark logo treatment</p>
              <BrandLogo logo={darkLogo} fallback="CRAYONS BRIDGE" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LogoPicker({ label, value, onChange }: {
  label: string;
  value: LogoPreview;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block rounded-xl border border-line p-4 text-sm">
      <span className="font-medium">{label}</span>
      <input className="mt-3 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-xs file:font-semibold" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} />
      {value ? <p className="mt-2 truncate text-xs text-muted">Selected: {value.name}</p> : <p className="mt-2 text-xs text-muted">PNG, JPEG, WebP or SVG · max 5 MB</p>}
    </label>
  );
}

function BrandLogo({ logo, fallback }: { logo: LogoPreview; fallback: string }) {
  return logo ? (
    <img src={logo.url} alt="Selected brand logo preview" className="max-h-12 max-w-48 object-contain" />
  ) : (
    <span className="text-sm font-bold tracking-[0.16em]">{fallback}</span>
  );
}

function ColourPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-line p-3 text-xs">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" />
      <span className="min-w-0"><span className="block font-medium">{label}</span><span className="text-muted">{value.toUpperCase()}</span></span>
    </label>
  );
}
