import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BridgeShell } from "@/components/bridge/shell";
import { RequireBridge } from "@/components/bridge/gate";
import {
  archiveWorkspacePreset,
  listWorkspacePresets,
  saveWorkspacePreset,
} from "@/lib/bridge/workspace-presets";
import type { LegalPresetConfig, OperationalPresetConfig } from "@/lib/bridge/workspace-presets-policy";

export const Route = createFileRoute("/settings/presets")({ component: WorkspacePresetsPage });

type PresetType = "OPERATIONAL" | "LEGAL";

const defaultOperational: OperationalPresetConfig = {
  companyName: "StreamVista OPC Pvt Ltd",
  defaultTerritory: "WORLDWIDE",
  defaultLanguage: "Malayalam",
  licenseModel: "TVOD",
  documentCategories: ["MASTER", "TRAILER", "SCREENER", "POSTER", "STILL", "SUBTITLE", "CENSOR_CERTIFICATE"],
};

const defaultLegal: LegalPresetConfig = {
  agreementReference: "",
  ownershipReference: "",
  rightsOwnerSharePct: 65,
  distributorSharePct: 35,
  exclusivity: "NON_EXCLUSIVE",
};

function WorkspacePresetsPage() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Workspace Presets">
          <WorkspacePresetsManager />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function WorkspacePresetsManager() {
  const qc = useQueryClient();
  const [type, setType] = useState<PresetType>("OPERATIONAL");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [name, setName] = useState("Default TVOD workspace");
  const [operational, setOperational] = useState<OperationalPresetConfig>(defaultOperational);
  const [legal, setLegal] = useState<LegalPresetConfig>(defaultLegal);
  const presetsQ = useQuery({
    queryKey: ["bridge-workspace-presets"],
    queryFn: () => listWorkspacePresets({ data: { includeArchived: true } }),
  });
  const save = useMutation({
    mutationFn: saveWorkspacePreset,
    onSuccess: async () => {
      setEditingId(undefined);
      await qc.invalidateQueries({ queryKey: ["bridge-workspace-presets"] });
    },
  });
  const archive = useMutation({
    mutationFn: archiveWorkspacePreset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bridge-workspace-presets"] }),
  });

  const presets = presetsQ.data?.presets ?? [];
  const active = presets.filter((preset) => preset.status === "ACTIVE");
  const archived = presets.filter((preset) => preset.status === "ARCHIVED");

  function startNew(nextType: PresetType = type) {
    setEditingId(undefined);
    setType(nextType);
    setName(nextType === "OPERATIONAL" ? "Default TVOD workspace" : "Agreement-specific TVOD terms");
    setOperational(defaultOperational);
    setLegal(defaultLegal);
    save.reset();
  }

  function startVersion(preset: (typeof presets)[number]) {
    setEditingId(preset.id);
    setType(preset.preset_type);
    setName(preset.name);
    if (preset.preset_type === "OPERATIONAL") {
      setOperational(preset.configuration as OperationalPresetConfig);
    } else {
      setLegal(preset.configuration as LegalPresetConfig);
    }
    save.reset();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({
      data: {
        ...(editingId ? { id: editingId } : {}),
        name,
        type,
        configuration: type === "OPERATIONAL" ? operational : legal,
      } as never,
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Super Admin · Configuration</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Reusable defaults, without automatic rights approval.</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Operational presets reduce repeated setup. Agreement presets prefill draft references and commercial terms only.
          A saved reference is not proof of ownership, and applying a preset never approves a license.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-semibold">{editingId ? "Create a new version" : "Create preset"}</h3>
              <p className="mt-1 text-xs text-muted">Previous versions remain in the archive.</p>
            </div>
            {editingId ? <Button variant="outline" size="sm" onClick={() => startNew()}>Cancel version</Button> : null}
          </div>

          <form className="mt-4 space-y-4" onSubmit={submit}>
            <label className="grid gap-1 text-sm">
              Preset category
              <select value={type} onChange={(event) => startNew(event.target.value as PresetType)} className="h-10 rounded-lg border border-line bg-elevated px-3">
                <option value="OPERATIONAL">Operational defaults</option>
                <option value="LEGAL">Agreement-specific terms</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Preset name
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={100} required className="h-10 rounded-lg border border-line bg-elevated px-3" />
            </label>

            {type === "OPERATIONAL" ? (
              <div className="space-y-3 rounded-xl bg-elevated p-3">
                <p className="text-sm font-semibold">Operational defaults</p>
                <label className="grid gap-1 text-sm">Company display name
                  <input value={operational.companyName} onChange={(event) => setOperational({ ...operational, companyName: event.target.value })} required className="h-10 rounded-lg border border-line bg-surface px-3" />
                </label>
                <label className="grid gap-1 text-sm">Default language
                  <input value={operational.defaultLanguage} onChange={(event) => setOperational({ ...operational, defaultLanguage: event.target.value })} required className="h-10 rounded-lg border border-line bg-surface px-3" />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="text-sm">Territory: <strong>Worldwide</strong> (current TVOD backend limit)</p>
                  <p className="text-sm">License model: <strong>TVOD</strong></p>
                </div>
                <p className="text-xs text-muted">Document categories are guidance only. Files still require individual storage and provenance verification.</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(["MASTER","TRAILER","SCREENER","POSTER","STILL","SUBTITLE","CENSOR_CERTIFICATE","OWNERSHIP_EVIDENCE","SIGNED_AGREEMENT"] as const).map((category) => (
                    <label key={category} className="flex items-center gap-2">
                      <input type="checkbox" checked={operational.documentCategories.includes(category)} onChange={(event) => setOperational({
                        ...operational,
                        documentCategories: event.target.checked
                          ? [...operational.documentCategories, category]
                          : operational.documentCategories.filter((item) => item !== category),
                      })} />
                      {category.replaceAll("_", " ")}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl bg-elevated p-3">
                <p className="text-sm font-semibold">Agreement-specific draft values</p>
                <label className="grid gap-1 text-sm">Agreement reference
                  <input value={legal.agreementReference} onChange={(event) => setLegal({ ...legal, agreementReference: event.target.value })} minLength={8} maxLength={500} required className="h-10 rounded-lg border border-line bg-surface px-3" />
                </label>
                <label className="grid gap-1 text-sm">Ownership evidence reference
                  <input value={legal.ownershipReference} onChange={(event) => setLegal({ ...legal, ownershipReference: event.target.value })} minLength={8} maxLength={500} required className="h-10 rounded-lg border border-line bg-surface px-3" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">Rights owner share (%)
                    <input type="number" min="0" max="100" step="1" value={legal.rightsOwnerSharePct} onChange={(event) => setLegal({ ...legal, rightsOwnerSharePct: Number(event.target.value), distributorSharePct: 100 - Number(event.target.value) })} required className="h-10 rounded-lg border border-line bg-surface px-3" />
                  </label>
                  <label className="grid gap-1 text-sm">Distributor share (%) · calculated
                    <input type="number" value={legal.distributorSharePct} readOnly className="h-10 rounded-lg border border-line bg-surface px-3" />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">Exclusivity
                  <select value={legal.exclusivity} onChange={(event) => setLegal({ ...legal, exclusivity: event.target.value as LegalPresetConfig["exclusivity"] })} className="h-10 rounded-lg border border-line bg-surface px-3">
                    <option value="NON_EXCLUSIVE">Non-exclusive</option>
                    <option value="EXCLUSIVE">Exclusive</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">Suggested validity days (optional; requires confirmation)
                  <input type="number" min="1" max="3650" value={legal.suggestedValidityDays ?? ""} onChange={(event) => setLegal({ ...legal, suggestedValidityDays: event.target.value ? Number(event.target.value) : undefined })} className="h-10 rounded-lg border border-line bg-surface px-3" />
                </label>
                <p className="text-xs text-muted">These are draft references/terms only. They do not verify documents, establish legal ownership, or approve a license.</p>
              </div>
            )}

            {save.isError ? <p role="alert" className="text-sm text-red-600">{save.error.message}</p> : null}
            {save.isSuccess ? <p role="status" className="text-sm text-emerald-700">Preset version saved.</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editingId ? "Save new version" : "Save preset"}</Button>
              <Button type="button" variant="outline" onClick={() => startNew()} disabled={save.isPending}>Clear</Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="font-display text-xl font-semibold">Active presets</h3><p className="text-xs text-muted">{active.length} active versions</p></div>
              <Button size="sm" variant="outline" onClick={() => presetsQ.refetch()}>Refresh</Button>
            </div>
            {presetsQ.isPending ? <p className="py-6 text-sm text-muted">Loading presets…</p> : presetsQ.isError ? <p role="alert" className="py-6 text-sm text-red-600">Unable to load presets: {presetsQ.error.message}</p> : active.length ? (
              <ul className="mt-3 divide-y divide-line">
                {active.map((preset) => (
                  <li key={preset.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{preset.name} <span className="text-xs text-muted">v{preset.version}</span></p>
                        <p className="mt-1 text-xs text-muted">{preset.preset_type === "OPERATIONAL" ? "Operational" : "Agreement-specific"} · Updated {new Date(preset.updated_at).toLocaleString()}</p>
                        <p className="mt-1 break-all text-xs text-muted">{preset.preset_type === "OPERATIONAL" ? (preset.configuration as OperationalPresetConfig).defaultLanguage + " · WORLDWIDE · TVOD" : (preset.configuration as LegalPresetConfig).agreementReference + " · " + (preset.configuration as LegalPresetConfig).rightsOwnerSharePct + "/" + (preset.configuration as LegalPresetConfig).distributorSharePct + " split"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startVersion(preset)}>New version</Button>
                        <Button size="sm" variant="outline" onClick={() => archive.mutate({ data: { id: preset.id } })} disabled={archive.isPending}>Archive</Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-sm text-muted">No active presets yet. Create one to reuse defaults.</p>}
            {archive.isError ? <p role="alert" className="mt-3 text-sm text-red-600">{archive.error.message}</p> : null}
          </div>
          <details className="rounded-2xl border border-line bg-surface p-5">
            <summary className="cursor-pointer font-semibold">Archived versions ({archived.length})</summary>
            <ul className="mt-3 divide-y divide-line">
              {archived.map((preset) => <li key={preset.id} className="py-3 text-sm"><strong>{preset.name}</strong> · v{preset.version} · {preset.preset_type}</li>)}
              {!archived.length ? <li className="py-3 text-sm text-muted">No archived versions.</li> : null}
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}
