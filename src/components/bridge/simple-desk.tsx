import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitleAssets } from "@/lib/bridge/assets";
import { confirmSimpleUpload, deleteTitleAsset, deleteUnfinishedAssets, getSimpleDesk, listDeskOffers, listTitleLog, matchTitleStorage, openTitleAsset, postDeskOffer, postSimpleDesk, prepareSimpleUpload } from "@/lib/bridge/simple-desk";
import { sendFile, uploadLimit } from "@/lib/bridge/upload-parts";
import { enqueueUpload } from "@/components/bridge/upload-tray";
import { advanceTitle, updateTitle } from "@/lib/bridge/titles";
import { nextStatus } from "@/lib/bridge/lifecycle";
import type { BridgeActor } from "@/lib/bridge/session";
import type { TitleStatus } from "@/lib/bridge/types";
import { toast } from "sonner";

const SLOTS = [
  ["master", "Film", "video/*"],
  ["trailer", "Trailer", "video/*"],
  ["poster_vertical", "Vertical poster", "image/*"],
  ["poster_horizontal", "Horizontal poster", "image/*"],
  ["thumbnail", "Thumbnail", "image/*"],
  ["subtitle", "English subtitles", ".srt,.vtt,text/vtt"],
  ["subtitle_extra", "More subtitles", ".srt,.vtt,text/vtt"],
  ["audio", "Film audio", "audio/*"],
  ["audio_dub", "Dubbed", "audio/*"],
  ["audio_description", "Description audio", "audio/*"],
  ["censor_certificate", "Certificate", "application/pdf,image/*"],
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(SLOTS.map(([kind, label]) => [kind, label]));

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
  genre,
  rating,
  playUrl,
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
  genre: string;
  rating: string;
  playUrl: string;
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
  const staff = actor.internalRole === "admin" || actor.internalRole === "super_admin" || actor.internalRole === "qc_reviewer";
  const log = useQuery({
    queryKey: ["title-log", titleId],
    queryFn: () => listTitleLog({ data: { titleId } }),
    enabled: staff,
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
  const [editGenre, setEditGenre] = useState(genre);
  const [editRating, setEditRating] = useState(rating);
  const [editPlayUrl, setEditPlayUrl] = useState(playUrl);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [player, setPlayer] = useState<null | { url: string; visual: "video" | "image" }>(null);
  const [showUnfinished, setShowUnfinished] = useState(false);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["simple-desk", titleId] }),
      qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] }),
      qc.invalidateQueries({ queryKey: ["title-log", titleId] }),
    ]);
  };

  const upload = (file: File, kind: (typeof SLOTS)[number][0], label: string) => {
    const limit = uploadLimit(kind);
    if (file.size > limit) {
      const message = limit > 200 * 1024 * 1024 ? "Keep the film under 8 GB." : "Keep this file under 200 MB.";
      setError(message);
      toast.error(message);
      return;
    }
    const contentType = file.type || "application/octet-stream";
    setError("");
    enqueueUpload({
      label,
      file,
      run: ({ signal, onProgress }) => sendFile({
        file,
        signal,
        prepare: () => prepareSimpleUpload({
          data: { titleId, filename: file.name, contentType, byteSize: file.size, kind },
        }),
        confirm: ({ path, partBase }) => confirmSimpleUpload({
          data: { titleId, path, contentType, byteSize: file.size, kind, partBase },
        }),
        onProgress,
      }),
      onDone: () => {
        setNotice("Saved.");
        toast.success("Saved.");
        void refresh();
      },
      onFail: () => toast.error("Saving stopped."),
    });
  };

  const next = nextStatus(status);
  const send = useMutation({
    mutationFn: () => advanceTitle({ data: { id: titleId, to: next! } }),
    onSuccess: async () => {
      setError("");
      setNotice("Submitted.");
      toast.success("Submitted. The desk and the studio have the update.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
        qc.invalidateQueries({ queryKey: ["simple-desk", titleId] }),
      ]);
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
        genre: editGenre.trim(),
        rating: editRating.trim(),
        playUrl: editPlayUrl.trim(),
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
      const videoFile = item && ["master", "screener", "trailer"].includes(item.kind);
      if (image || videoFile) setPlayer({ url: opened.url, visual: videoFile ? "video" : "image" });
      else window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  const admin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  const rows = assets.data?.assets ?? [];
  const ready = rows.filter((item) => item.verified);
  const unfinished = rows.filter((item) => item.pending);

  const match = useMutation({
    mutationFn: () => matchTitleStorage({ data: { titleId } }),
    onSuccess: async (res) => {
      toast.success(res.found ? "Checked." : "Nothing new found.");
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
            {staff ? <Field label="Genre" value={editGenre} onChange={setEditGenre} /> : null}
            {staff ? <Field label="Rating" value={editRating} onChange={setEditRating} /> : null}
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
            {staff ? (
              <label className="text-sm font-semibold sm:col-span-2">
                Play or delivery link
                <input value={editPlayUrl} onChange={(e) => setEditPlayUrl(e.target.value)} placeholder="https://" className="mt-1 h-12 w-full rounded-xl border border-line-strong bg-white px-3 font-normal" />
              </label>
            ) : null}
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
            {staff && genre ? <Fact label="Genre" value={genre} /> : null}
            {staff && rating ? <Fact label="Rating" value={rating} /> : null}
            {staff && playUrl ? <Fact label="Delivery" value={playUrl} wide /> : null}
          </dl>
        )}
      </section>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Files</h2>
        <p className="mb-2 text-sm text-muted">One file in each slot. A new file replaces the old one.</p>
        <ul className="divide-y divide-line">
          {SLOTS.map(([kind, label, accept]) => {
            const item = ready.find((row) => row.kind === kind)
              || (kind === "master" ? ready.find((row) => row.kind === "screener") : undefined)
              || (kind === "poster_vertical" ? ready.find((row) => row.kind === "poster") : undefined);
            const visual = kind === "master" || kind === "trailer";
            return (
              <li key={kind} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted">{item?.byteSize ? `${Math.max(1, Math.round(Number(item.byteSize) / 1024 / 1024))} MB` : "Empty"}</p>
                </div>
                {item ? <button type="button" onClick={() => void view(item.id)} className="text-sm font-semibold">{visual ? "Play" : "View"}</button> : null}
                <label className="cursor-pointer text-sm font-semibold">
                  {item ? "Replace" : "Add"}
                  <input type="file" accept={accept} className="sr-only" onChange={(e) => {
                    const nextFile = e.target.files?.[0];
                    e.target.value = "";
                    if (nextFile) upload(nextFile, kind, label);
                  }} />
                </label>
                {item ? <button type="button" onClick={() => remove.mutate(item.id)} className="text-sm font-semibold text-red-700">Remove</button> : null}
              </li>
            );
          })}
        </ul>
        {next ? (
          <button type="button" disabled={send.isPending} onClick={() => send.mutate()} className="mt-3 rounded-full border-2 border-[#0b1220] px-4 py-2 text-sm font-semibold">
            {send.isPending ? "Submitting…" : "Submit"}
          </button>
        ) : null}
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
      {staff && (log.data?.rows.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">Record</h2>
          <ul className="mt-2 divide-y divide-line">
            {log.data?.rows.map((row, index) => (
              <li key={`${row.at}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                <span>{row.action}</span>
                <span className="text-muted">{row.at.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
              <p className="font-semibold">{({ upload: "File", submit: "Submitted", note: "Note", park: "Parked", approve: "Approved", replace: "Replace" } as Record<string, string>)[item.action] || "Update"} · {item.actor}</p>
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

function Field({ label, value, onChange, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "numeric" | "text" }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input value={value} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base font-normal" />
    </label>
  );
}
