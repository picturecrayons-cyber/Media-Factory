import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/bridge/status-rail";
import { createTitle, listTitles } from "@/lib/bridge/titles";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import {
  detectDuplicateGroups,
  generateTitleDeduplicationKey,
} from "@/lib/bridge/duplicate-policy";
import { AdminPreviewModal } from "@/components/bridge/admin-preview-modal";
import { DuplicateMergeModal } from "@/components/bridge/duplicate-merge-modal";
import type { BridgeActor } from "@/lib/bridge/session";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "UPLOADING", label: "Uploading" },
  { value: "PREPARING", label: "Preparing" },
  { value: "QC_REVIEW", label: "QC Review" },
  { value: "RIGHTS_REVIEW", label: "Rights Review" },
  { value: "LICENSING_READY", label: "Licensing Ready" },
  { value: "LIVE_FOR_BUYERS", label: "Live for Buyers" },
  { value: "IN_NEGOTIATION", label: "In Negotiation" },
  { value: "LICENSED", label: "Licensed" },
  { value: "DELIVERED", label: "Delivered" },
] as const;

export function TitleList({
  empty,
  query = "",
  actor,
}: {
  empty: string;
  query?: string;
  actor?: BridgeActor;
}) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const allTitles = titlesQ.data?.titles ?? [];

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [duplicatesOnly, setDuplicatesOnly] = useState<boolean>(false);
  const [buyerVisibilityFilter, setBuyerVisibilityFilter] = useState<"ALL" | "LIVE" | "INTERNAL">("ALL");

  const [previewTitleId, setPreviewTitleId] = useState<string | null>(null);
  const [mergeModalProps, setMergeModalProps] = useState<{
    canonicalId: string;
    retiringId: string;
    isOpen: boolean;
  }>({ canonicalId: "", retiringId: "", isOpen: false });

  // Detect duplicate groups across catalog
  const duplicateGroups = useMemo(() => detectDuplicateGroups(allTitles), [allTitles]);

  const titles = useMemo(() => {
    return allTitles.filter((t) => {
      // Search query
      const matchQuery =
        !query ||
        `${t.name} ${t.id} ${t.language} ${t.year ?? ""} ${t.contentType ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      if (!matchQuery) return false;

      // Status filter
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;

      // Duplicates filter
      if (duplicatesOnly) {
        const key = generateTitleDeduplicationKey(t);
        if (!duplicateGroups.has(key)) return false;
      }

      // Buyer visibility filter
      const isLive = ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status);
      if (buyerVisibilityFilter === "LIVE" && !isLive) return false;
      if (buyerVisibilityFilter === "INTERNAL" && isLive) return false;

      return true;
    });
  }, [allTitles, query, statusFilter, duplicatesOnly, buyerVisibilityFilter, duplicateGroups]);

  const isStaff = Boolean(actor?.internalRole);
  const canMerge = actor?.internalRole === "super_admin" || actor?.internalRole === "admin";

  if (titlesQ.isPending) return <p className="text-sm text-muted">Loading titles…</p>;
  if (titlesQ.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-accent">
        <p>Could not load titles.</p>
        <Button type="button" onClick={() => void titlesQ.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const duplicateGroupsList = Array.from(duplicateGroups.entries());

  return (
    <div className="space-y-4">
      {/* Duplicate Warning Banner */}
      {duplicateGroupsList.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 text-amber-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <h3 className="font-semibold text-sm text-amber-300">
                Potential Duplicate Title Records Detected ({duplicateGroupsList.length} group{duplicateGroupsList.length > 1 ? "s" : ""})
              </h3>
            </div>
            {canMerge ? (
              <span className="text-xs text-amber-300/80 bg-amber-400/20 px-2.5 py-1 rounded-full font-medium">
                Super Admin Deduplication Available
              </span>
            ) : null}
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Identical normalized title, language, and release year detected across multiple records. Protected records with live buyer visibility must remain preserved, while unlinked draft duplicates can be safely evaluated for transactional merging.
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            {duplicateGroupsList.map(([key, group]) => {
              const canonicalCandidate =
                group.find((t) => t.id === "cb8c141dc72d727a53a4f35d8851e100") ??
                group.find((t) => t.status === "PREPARING") ??
                group[0];
              const retiringCandidate = group.find((t) => t.id !== canonicalCandidate.id) ?? group[1];

              return (
                <div key={key} className="flex flex-wrap items-center gap-2 bg-surface/60 border border-line p-2.5 rounded-xl text-xs">
                  <span className="font-medium text-fg">{group[0].name}</span>
                  <span className="text-muted">({group.length} records)</span>
                  {canMerge && retiringCandidate ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/20"
                      onClick={() =>
                        setMergeModalProps({
                          canonicalId: canonicalCandidate.id,
                          retiringId: retiringCandidate.id,
                          isOpen: true,
                        })
                      }
                    >
                      Compare & Merge →
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            aria-label="Filter by title status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-line bg-elevated px-2.5 text-xs text-fg"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Buyer Visibility Filter */}
          <select
            aria-label="Filter by buyer visibility"
            value={buyerVisibilityFilter}
            onChange={(e) => setBuyerVisibilityFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-line bg-elevated px-2.5 text-xs text-fg"
          >
            <option value="ALL">All Visibility</option>
            <option value="LIVE">Live for Buyers Only</option>
            <option value="INTERNAL">Internal Only</option>
          </select>

          {/* Duplicates Only Toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer bg-elevated border border-line px-2.5 py-1 rounded-lg text-xs">
            <input
              type="checkbox"
              checked={duplicatesOnly}
              onChange={(e) => setDuplicatesOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <span>Duplicates Only ({Array.from(duplicateGroups.values()).flat().length})</span>
          </label>
        </div>

        <p className="text-muted">
          Showing {titles.length} of {allTitles.length} title{allTitles.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Title Records List */}
      {!titles.length ? (
        <p className="text-sm text-muted py-8 text-center">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface overflow-hidden">
          {titles.map((t) => {
            const groupKey = generateTitleDeduplicationKey(t);
            const isDuplicate = duplicateGroups.has(groupKey);
            const group = duplicateGroups.get(groupKey);
            const isLive = ["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"].includes(t.status);

            return (
              <li key={t.id} className="p-4 hover:bg-fg/5 transition">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/title/$id"
                        params={{ id: t.id }}
                        className="font-semibold text-base text-fg hover:text-accent transition truncate"
                      >
                        {t.name}
                      </Link>
                      {t.nameMl ? <span className="text-xs text-muted">({t.nameMl})</span> : null}
                      {isDuplicate && group ? (
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                          ⚠️ Duplicate ({group.length} records)
                        </span>
                      ) : null}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isLive
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : "bg-elevated text-muted border border-line"
                        }`}
                      >
                        {isLive ? "🟢 Live for Buyers" : "🔒 Internal Only"}
                      </span>
                    </div>

                    <p className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1 font-mono">
                      <span>ID: {t.id}</span>
                      <span>·</span>
                      <span>{t.contentType ? `${t.contentType} · ` : ""}{t.language}{t.year ? ` · ${t.year}` : ""}</span>
                      {t.runtimeMinutes ? (
                        <>
                          <span>·</span>
                          <span>{t.runtimeMinutes} min</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <StatusChip status={t.status} />

                    {isStaff ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setPreviewTitleId(t.id)}
                      >
                        👁️ Admin Preview
                      </Button>
                    ) : null}

                    {canMerge && isDuplicate && group && group.length > 1 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        onClick={() => {
                          const other = group.find((item) => item.id !== t.id) ?? group[0];
                          setMergeModalProps({
                            canonicalId: t.id === "6eec48a7c576789ede558e66ba18b929" ? other.id : t.id,
                            retiringId: t.id === "6eec48a7c576789ede558e66ba18b929" ? t.id : other.id,
                            isOpen: true,
                          });
                        }}
                      >
                        Merge
                      </Button>
                    ) : null}

                    <Link
                      to="/title/$id"
                      params={{ id: t.id }}
                      className="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg"
                    >
                      Open Workspace →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Admin Preview Modal */}
      {previewTitleId ? (
        <AdminPreviewModal
          titleId={previewTitleId}
          isOpen={Boolean(previewTitleId)}
          onClose={() => setPreviewTitleId(null)}
        />
      ) : null}

      {/* Duplicate Merge Modal */}
      {mergeModalProps.isOpen ? (
        <DuplicateMergeModal
          canonicalId={mergeModalProps.canonicalId}
          retiringId={mergeModalProps.retiringId}
          isOpen={mergeModalProps.isOpen}
          onClose={() => setMergeModalProps((prev) => ({ ...prev, isOpen: false }))}
          onMerged={() => void titlesQ.refetch()}
        />
      ) : null}
    </div>
  );
}

export function CreateTitleForm({ concise = false }: { concise?: boolean } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [nameMl, setNameMl] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [contentType, setContentType] = useState("Film");
  const [country, setCountry] = useState("India");
  const [releaseDate, setReleaseDate] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [director, setDirector] = useState("");
  const [producer, setProducer] = useState("");
  const [cast, setCast] = useState("");
  const [year, setYear] = useState("");
  const [fee, setFee] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      createTitle({
        data: {
          name,
          nameMl: nameMl || undefined,
          synopsis: synopsis || undefined,
          language: language || undefined,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          licensingFeePaise: fee ? Math.round(Number(fee) * 100) : undefined,
          contentType: contentType || undefined,
          countryOfOrigin: country || undefined,
          releaseDate: releaseDate || undefined,
          director: director || undefined,
          producer: producer || undefined,
          cast: cast ? cast.split(",").map((v) => v.trim()).filter(Boolean) : undefined,
        },
      }),
    onSuccess: (res) => {
      toast("Title opened as DRAFT");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      if (res.title) navigate({ to: "/title/$id", params: { id: res.title.id } });
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Could not create title"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const feeInr = fee ? Number(fee) : undefined;
    if (feeInr !== undefined && (!Number.isFinite(feeInr) || feeInr < 0 || feeInr > 20_000_000)) {
      toast("License fee must be between ₹0 and ₹2,00,00,000");
      return;
    }
    mut.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Title name in English *"
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      />
      <input
        value={nameMl}
        onChange={(e) => setNameMl(e.target.value)}
        placeholder="Original language name (optional)"
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      />
      <input
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        placeholder="Primary language *"
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      />
      <select
        value={contentType}
        onChange={(e) => setContentType(e.target.value)}
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      >
        {BRIDGE_LOOP_LANES.map((lane) => (
          <option key={lane.id} value={lane.loopType}>
            {lane.label}
          </option>
        ))}
      </select>
      <input
        value={year}
        onChange={(e) => setYear(e.target.value)}
        placeholder="Release year (e.g. 2024)"
        type="number"
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      />
      <input
        value={runtimeMinutes}
        onChange={(e) => setRuntimeMinutes(e.target.value)}
        placeholder="Runtime minutes"
        type="number"
        className="h-10 rounded-xl border border-line bg-elevated px-3 text-sm"
      />
      <textarea
        value={synopsis}
        onChange={(e) => setSynopsis(e.target.value)}
        placeholder="Synopsis / logline"
        rows={2}
        className="sm:col-span-2 rounded-xl border border-line bg-elevated p-3 text-sm"
      />
      <Button type="submit" disabled={mut.isPending} className="sm:col-span-2">
        {mut.isPending ? "Creating draft…" : "Create Title Draft"}
      </Button>
    </form>
  );
}
