import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitleAssets } from "@/lib/bridge/assets";
import { confirmSimpleUpload, deleteTitleAsset, deleteUnfinishedAssets, getSimpleDesk, listDeskOffers, matchTitleStorage, openTitleAsset, postDeskOffer, postSimpleDesk, prepareSimpleUpload } from "@/lib/bridge/simple-desk";
import { advanceTitle, updateTitle } from "@/lib/bridge/titles";
import { nextStatus } from "@/lib/bridge/lifecycle";
import type { BridgeActor } from "@/lib/bridge/session";
import type { TitleStatus } from "@/lib/bridge/types";
import { toast } from "sonner";

const MAX_BYTES = 200 * 1024 * 1024;
const KIND_LABEL: Record<string, string> = {
  master: "Master",
  poster: "Poster",
  poster_vertical: "Poster",
  poster_horizontal: "Landscape",
  thumbnail: "Thumbnail",
  subtitle: "Subtitle",
  screener: "Screener",
  censor_certificate: "Certificate",
  technical: "Technical",
};

export function SimpleDesk({
  titleId,
  actor,
  name,
  synopsis,
  status,
  language,
  year,
  runtimeMinutes,
  nameMl,
  country,
  releaseDate,
  director,
  producer,
  contentType,
  seoTitle,
  seoDescription,
}: {
  titleId: string;
  actor: BridgeActor;
  name: string;
  synopsis: string;
  status: TitleStatus;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  nameMl: string;
  country: string;
  releaseDate: string;
  director: string;
  producer: string;
  contentType: string;
  seoTitle: string;
  seoDescription: string;
}) {
  const qc = useQueryClient();
  const desk = useQuery({
    queryKey: ["simple-desk", titleId],
    queryFn: () => getSimpleDesk({ data: { titleId } }),
  });
  const assets = useQuery({
    queryKey: ["bridge-assets", titleId],
    queryFn: () => listTitleAssets({ data: { titleId } }),
  });
  const offers = useQuery({
    queryKey: ["desk-offers", titleId],
    queryFn: () => listDeskOffers({ data: { titleId } }),
  });
  const [note, setNote] = useState("");
  const [editName, setEditName] = useState(name);
  const [editSynopsis, setEditSynopsis] = useState(synopsis);
  const [editLanguage, setEditLanguage] = useState(language);
  const [editYear, setEditYear] = useState(year ? String(year) : "");
  const [editRuntime, setEditRuntime] = useState(runtimeMinutes ? String(runtimeMinutes) : "");
  const [editOriginal, setEditOriginal] = useState(nameMl);
  const [editCountry, setEditCountry] = useState(country);
  const [editRelease, setEditRelease] = useState(releaseDate.slice(0, 10));
  const [editDirector, setEditDirector] = useState(director);
  const [editProducer, setEditProducer] = useState(producer);
  const [editType, setEditType] = useState(contentType || "Film");
  const [editSeoTitle, setEditSeoTitle] = useState(seoTitle);
  const [editSeoDescription, setEditSeoDescription] = useState(seoDescription);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [player, setPlayer] = useState<null | { url: string; visual: "video" | "image" }>(null);
  const [showUnfinished, setShowUnfinished] = useState(false);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["simple-desk", titleId] }),
      qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] }),
      qc.invalidateQueries({ queryKey: ["title-poster", titleId] }),
    ]);
  };

  const upload = useMutation({
    mutationFn: async (input: { file: File; kind: "poster_vertical" | "master" | "subtitle" | "censor_certificate" }) => {
      if (input.file.size > MAX_BYTES) throw new Error("Keep the file under 200 MB.");
      const contentType = input.file.type || "application/octet-stream";
      const prepared = await prepareSimpleUpload({
        data: { titleId, filename: input.file.name, contentType, byteSize: input.file.size, kind: input.kind },
      });
      const sent = await fetch(prepared.url, {
        method: "PUT",
        body: input.file,
        headers: { "content-type": contentType },
      });
      if (!sent.ok) throw new Error(`Upload failed (${sent.status})`);
      return confirmSimpleUpload({
        data: { titleId, path: prepared.path, contentType, byteSize: input.file.size, kind: input.kind },
      });
    },
    onSuccess: async () => {
      setError("");
      setNotice("Saved.");
      toast.success("File saved.");
      await refresh();
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(message);
      toast.error(message);
    },
  });

  const next = nextStatus(status);
  const send = useMutation({
    mutationFn: () => advanceTitle({ data: { id: titleId, to: next! } }),
    onSuccess: async () => {
      setError("");
      setNotice("Submitted.");
      toast.success("Submitted.");
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Could not submit";
      setError(message);
      toast.error(message);
    },
  });

  const act = useMutation({
    mutationFn: (action: "park" | "approve" | "replace" | "note") =>
      postSimpleDesk({ data: { titleId, action, body: note || action } }),
    onSuccess: async () => {
      setNote("");
      setError("");
      setNotice("Saved.");
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save"),
  });

  const saveEdit = useMutation({
    mutationFn: () => updateTitle({
      data: {
        id: titleId,
        name: editName.trim(),
        nameMl: editOriginal.trim(),
        synopsis: editSynopsis,
        language: editLanguage.trim() || language,
        year: editYear.trim() ? Number(editYear) : null,
        runtimeMinutes: editRuntime.trim() ? Number(editRuntime) : null,
        contentType: editType,
        countryOfOrigin: editCountry.trim() || null,
        releaseDate: editRelease.trim() || null,
        director: editDirector,
        producer: editProducer,
        seoTitle: editSeoTitle.trim(),
        seoDescription: editSeoDescription.trim(),
      },
    }),
    onSuccess: async () => {
      setError("");
      setNotice("Saved.");
      setEditing(false);
      toast.success("Saved.");
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save details"),
  });

  async function view(assetId: string) {
    try {
      const item = rows.find((row) => row.id === assetId);
      const opened = await openTitleAsset({ data: { assetId } });
      const image = item && ["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(item.kind);
      const video = item && ["master", "screener"].includes(item.kind);
      if (image || video) setPlayer({ url: opened.url, visual: video ? "video" : "image" });
      else window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  const staff = actor.internalRole === "admin" || actor.internalRole === "super_admin" || actor.internalRole === "qc_reviewer";
  const admin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  const rows = assets.data?.assets ?? [];
  const ready = rows.filter((item) => item.verified);
  const unfinished = rows.filter((item) => item.pending);
  const video = ready.filter((item) => item.kind === "master" || item.kind === "screener");
  const documents = ready.filter((item) => item.kind === "censor_certificate" || item.kind === "technical");
  const audio = ready.filter((item) => item.kind === "subtitle");
  const artwork = ready.filter((item) => ["poster", "poster_vertical", "poster_horizontal", "thumbnail"].includes(item.kind));
  const artQ = useQuery({
    queryKey: ["title-art", titleId, artwork.map((item) => item.id).join(",")],
    enabled: artwork.length > 0,
    queryFn: async () => {
      const found = await Promise.all(artwork.slice(0, 4).map(async (item) => {
        try {
          const opened = await openTitleAsset({ data: { assetId: item.id } });
          return { id: item.id, url: opened.url };
        } catch {
          return null;
        }
      }));
      return found.filter((item): item is { id: string; url: string } => Boolean(item));
    },
  });

  const match = useMutation({
    mutationFn: () => matchTitleStorage({ data: { titleId } }),
    onSuccess: async (res) => {
      toast.success(res.found ? `Found ${res.found} file${res.found === 1 ? "" : "s"} in Oracle.` : "No matching file in Oracle.");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not check storage"),
  });
  const remove = useMutation({
    mutationFn: (assetId: string) => deleteTitleAsset({ data: { assetId } }),
    onMutate: async (assetId) => {
      await qc.cancelQueries({ queryKey: ["bridge-assets", titleId] });
      const previous = qc.getQueryData(["bridge-assets", titleId]);
      qc.setQueryData(["bridge-assets", titleId], (old: { assets?: Array<{ id: string }> } | undefined) =>
        old?.assets ? { ...old, assets: old.assets.filter((item) => item.id !== assetId) } : old,
      );
      return { previous };
    },
    onSuccess: async () => {
      toast.success("Deleted.");
      await refresh();
    },
    onError: (e, _id, context) => {
      if (context?.previous) qc.setQueryData(["bridge-assets", titleId], context.previous);
      toast.error(e instanceof Error ? e.message : "Could not delete");
    },
  });
  const clearUnfinished = useMutation({
    mutationFn: () => deleteUnfinishedAssets({ data: { titleId } }),
    onSuccess: async (res) => {
      toast.success(res.deleted ? `Deleted ${res.deleted} unfinished.` : "Nothing unfinished to delete.");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  return (
    <section className="space-y-5">
      {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Data</h2>
          {editing ? (
            <button type="button" disabled={saveEdit.isPending || !editName.trim()} onClick={() => saveEdit.mutate()} className="rounded-full bg-[#0b1220] px-4 py-2 text-sm font-semibold text-white">
              {saveEdit.isPending ? "Saving…" : "Save"}
            </button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Edit</button>
          )}
        </div>
        {editing ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Title" value={editName} onChange={setEditName} />
            <Field label="Language" value={editLanguage} onChange={setEditLanguage} />
            <Field label="Year" value={editYear} onChange={setEditYear} inputMode="numeric" />
            <Field label="Runtime, minutes" value={editRuntime} onChange={setEditRuntime} inputMode="numeric" />
            <label className="text-sm font-semibold sm:col-span-2">
              Synopsis
              <textarea value={editSynopsis} onChange={(e) => setEditSynopsis(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Search title
              <input value={editSeoTitle} onChange={(e) => setEditSeoTitle(e.target.value)} maxLength={70} className="mt-1 h-12 w-full rounded-xl border border-line-strong bg-white px-3 font-normal" />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Search description
              <textarea value={editSeoDescription} onChange={(e) => setEditSeoDescription(e.target.value)} maxLength={160} rows={2} className="mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2 font-normal" />
            </label>
          </div>
        ) : (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Fact label="Title" value={name} />
            <Fact label="Language" value={language} />
            <Fact label="Year" value={year ? String(year) : ""} />
            <Fact label="Runtime" value={runtimeMinutes ? `${runtimeMinutes} min` : ""} />
            {synopsis ? <Fact label="Synopsis" value={synopsis} wide /> : null}
            {seoTitle ? <Fact label="Search title" value={seoTitle} wide /> : null}
            {seoDescription ? <Fact label="Search description" value={seoDescription} wide /> : null}
          </dl>
        )}
      </section>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Files</h2>
        <div className="flex flex-wrap gap-2">
          {([
            ["poster_vertical", "Poster", "image/*"],
            ["master", "Video", "video/*"],
            ["censor_certificate", "Document", "application/pdf,image/*"],
            ["subtitle", "Subtitles", ".srt,.vtt,text/vtt"],
          ] as const).map(([kind, label, accept]) => (
            <label key={kind} className="cursor-pointer rounded-full bg-[#0b1220] px-4 py-2 text-sm font-semibold text-white">
              {upload.isPending ? "Saving…" : label}
              <input
                type="file"
                accept={accept}
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const nextFile = e.target.files?.[0];
                  e.target.value = "";
                  if (nextFile) upload.mutate({ file: nextFile, kind });
                }}
              />
            </label>
          ))}
          {next ? (
            <button type="button" disabled={send.isPending} onClick={() => send.mutate()} className="rounded-full border-2 border-[#0b1220] px-4 py-2 text-sm font-semibold">
              {send.isPending ? "Submitting…" : "Submit"}
            </button>
          ) : null}
        </div>
        {artQ.data?.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {artQ.data.map((item) => (
              <button key={item.id} type="button" onClick={() => setPlayer({ url: item.url, visual: "image" })} className="aspect-[2/3] overflow-hidden rounded-2xl border border-line">
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        {assets.isPending ? <p className="mt-3 text-sm text-muted">Loading files…</p> : null}
        <FileGroup title="Video" rows={video} onView={view} onDelete={admin ? (id) => remove.mutate(id) : undefined} />
        <FileGroup title="Documents" rows={documents} onView={view} onDelete={admin ? (id) => remove.mutate(id) : undefined} />
        <FileGroup title="Audio and subtitles" rows={audio} onView={view} onDelete={admin ? (id) => remove.mutate(id) : undefined} />
        {staff ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={match.isPending} onClick={() => match.mutate()} className="rounded-full border-2 border-[#0b1220] px-3 py-1.5 text-sm font-semibold">
              {match.isPending ? "Checking…" : "Check storage"}
            </button>
            {admin && unfinished.length ? (
              <button type="button" disabled={clearUnfinished.isPending} onClick={() => clearUnfinished.mutate()} className="rounded-full border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-700">
                Delete unfinished
              </button>
            ) : null}
          </div>
        ) : null}
        {unfinished.length ? (
          <button type="button" onClick={() => setShowUnfinished((open) => !open)} className="mt-4 text-sm font-semibold text-muted">
            {showUnfinished ? "Hide" : "Show"} {unfinished.length} unfinished
          </button>
        ) : null}
        {showUnfinished ? (
          <ul className="mt-3 divide-y divide-line">
            {unfinished.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{KIND_LABEL[item.kind] || item.kind}</p>
                  <p className="text-xs text-muted">Not saved</p>
                </div>
                {admin ? <button type="button" onClick={() => remove.mutate(item.id)} className="text-sm font-semibold text-red-700">Delete</button> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <DeskOffers titleId={titleId} staff={staff} offers={offers.data?.offers ?? []} />

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) act.mutate("note");
        }}
      >
        <label className="text-sm">
          Message
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2" placeholder="Write a note" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={act.isPending || !note.trim()} className="rounded-full border border-line px-4 py-2 text-sm">
            Send
          </button>
          {staff ? (
            <>
              <button type="button" disabled={act.isPending} onClick={() => act.mutate("park")} className="rounded-full border border-line px-4 py-2 text-sm">Park</button>
              <button type="button" disabled={act.isPending} onClick={() => act.mutate("approve")} className="rounded-full border border-line px-4 py-2 text-sm">Approve</button>
              <button type="button" disabled={act.isPending} onClick={() => act.mutate("replace")} className="rounded-full border border-line px-4 py-2 text-sm">Ask replace</button>
            </>
          ) : null}
        </div>
      </form>

      {(desk.data?.notes.length ?? 0) > 0 ? (
        <ul className="space-y-2">
          {desk.data?.notes.map((item) => (
            <li key={item.id} className="rounded-xl border border-line px-3 py-2 text-sm">
              <p className="font-semibold">{item.action} · {item.actor}</p>
              <p className="text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {player ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setPlayer(null)}>
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            {player.visual === "video" ? (
              <video src={player.url} controls autoPlay className="max-h-[78vh] w-full bg-black" />
            ) : (
              <img src={player.url} alt="" className="max-h-[78vh] w-full object-contain" />
            )}
            <button type="button" onClick={() => setPlayer(null)} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-semibold">Close</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DeskOffers({
  titleId,
  staff,
  offers,
}: {
  titleId: string;
  staff: boolean;
  offers: Array<{ id: string; kind: string; partner: string; chargePaise: number; status: string; note: string }>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"qc" | "mastering" | "conversion" | "pitch">("pitch");
  const [status, setStatus] = useState<"offered" | "interested" | "rejected" | "done">("offered");
  const [partner, setPartner] = useState("");
  const [rupees, setRupees] = useState("");
  const [note, setNote] = useState("");
  const post = useMutation({
    mutationFn: () => postDeskOffer({
      data: {
        titleId,
        kind,
        partner,
        chargePaise: Math.round((Number(rupees) || 0) * 100),
        status,
        note,
      },
    }),
    onSuccess: async () => {
      setOpen(false);
      setNote("");
      setPartner("");
      setRupees("");
      toast.success("Update sent to the owner.");
      await qc.invalidateQueries({ queryKey: ["desk-offers", titleId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send"),
  });
  if (!staff && !offers.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Desk</h2>
        {staff ? (
          <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">{open ? "Close" : "Update"}</button>
        ) : null}
      </div>
      {open ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            post.mutate();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-11 rounded-xl border border-line px-3">
              <option value="pitch">Pitch</option>
              <option value="qc">QC</option>
              <option value="mastering">Mastering</option>
              <option value="conversion">Conversion</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-11 rounded-xl border border-line px-3">
              <option value="offered">Offered</option>
              <option value="interested">Interested</option>
              <option value="rejected">Rejected</option>
              <option value="done">Done</option>
            </select>
          </div>
          <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Partner, if this is a pitch" className="h-11 rounded-xl border border-line px-3" />
          <input value={rupees} onChange={(e) => setRupees(e.target.value)} inputMode="numeric" placeholder="Charge in ₹, or leave empty" className="h-11 rounded-xl border border-line px-3" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} required minLength={2} rows={2} placeholder="What the owner should know" className="rounded-xl border border-line px-3 py-2" />
          <button type="submit" disabled={post.isPending} className="h-11 rounded-full bg-[#0b1220] text-sm font-semibold text-white">{post.isPending ? "Sending…" : "Send update"}</button>
        </form>
      ) : null}
      <ul className="mt-3 divide-y divide-line">
        {offers.map((item) => (
          <li key={item.id} className="py-3">
            <p className="text-sm font-semibold">{item.kind} · {item.status}{item.partner ? ` · ${item.partner}` : ""}</p>
            <p className="text-sm text-muted">{item.chargePaise > 0 ? `₹${Math.round(item.chargePaise / 100)} · ` : "No charge · "}{item.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold leading-6">{value}</dd>
    </div>
  );
}

function FileGroup({
  title,
  rows,
  onView,
  onDelete,
}: {
  title: string;
  rows: Array<{ id: string; kind: string; byteSize: number | null }>;
  onView: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="mt-1 divide-y divide-line">
          {rows.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <p className="min-w-0 flex-1 text-sm">{KIND_LABEL[item.kind] || item.kind}{item.byteSize ? ` · ${Math.max(1, Math.round(Number(item.byteSize) / 1024 / 1024))} MB` : ""}</p>
              <button type="button" onClick={() => onView(item.id)} className="text-sm font-semibold">{item.kind === "master" || item.kind === "screener" ? "Play" : "View"}</button>
              {onDelete ? <button type="button" onClick={() => onDelete(item.id)} className="text-sm font-semibold text-red-700">Delete</button> : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-sm text-muted">None yet.</p>}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "numeric" | "text" }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input value={value} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base font-normal" />
    </label>
  );
}
