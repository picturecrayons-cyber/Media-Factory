import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTitleAssets } from "@/lib/bridge/assets";
import { confirmSimpleUpload, deleteBridgeTitle, deleteTitleAsset, deleteUnfinishedAssets, getSimpleDesk, listDeskOffers, listTitleLog, matchTitleStorage, openTitleAsset, postDeskOffer, postSimpleDesk, prepareSimpleUpload, setPublicPoster } from "@/lib/bridge/simple-desk";
import { sendFile, uploadLimit } from "@/lib/bridge/upload-parts";
import { enqueueUpload } from "@/components/bridge/upload-tray";
import { advanceTitle, updateTitle } from "@/lib/bridge/titles";
import { nextStatus } from "@/lib/bridge/lifecycle";
import type { BridgeActor } from "@/lib/bridge/session";
import type { TitleStatus } from "@/lib/bridge/types";
import { getTitleProcess, openTitleReview, setClearance } from "@/lib/bridge/clearance";
import { reviewAdminTitle } from "@/lib/bridge/admin-workstations";

function DeskVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const hlsFile = url.includes(".m3u8");
    if (!hlsFile) {
      video.src = url;
      void video.play().catch(() => undefined);
      return;
    }
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !ref.current) return;
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        void video.play().catch(() => undefined);
        return;
      }
      if (!Hls.isSupported()) return;
      const player = new Hls({ capLevelToPlayerSize: true, startLevel: -1, testBandwidth: true });
      player.loadSource(url);
      player.attachMedia(video);
      hls = player;
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [url]);
  return <video ref={ref} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black" />;
}

const CORE = [
  ["master", "Film", "video/*"],
  ["trailer", "Trailer", "video/*"],
  ["poster_vertical", "Vertical poster", "image/*"],
  ["poster_horizontal", "Horizontal poster", "image/*"],
  ["thumbnail", "Thumbnail", "image/*"],
  ["subtitle", "English subtitles", ".srt,.vtt,text/vtt"],
  ["censor_certificate", "Certificate", "application/pdf,image/*"],
] as const;

const OPTIONAL = [
  ["subtitle_extra", "More subtitles", ".srt,.vtt,text/vtt"],
  ["audio", "Film audio", "audio/*"],
  ["audio_dub", "Dubbed", "audio/*"],
  ["audio_description", "Description audio", "audio/*"],
] as const;

const SLOTS = [...CORE, ...OPTIONAL] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(SLOTS.map(([kind, label]) => [kind, label]));

function groupLog(rows: Array<{ action: string; at: string }>) {
  const groups: Array<{ action: string; at: string; count: number }> = [];
  for (const row of rows) {
    const minute = row.at.slice(0, 16);
    const last = groups[groups.length - 1];
    if (last && last.action === row.action && last.at.slice(0, 16) === minute) last.count += 1;
    else groups.push({ action: row.action, at: row.at, count: 1 });
  }
  return groups;
}

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
  const [optionalOpen, setOptionalOpen] = useState(false);

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
      setNotice("Message sent. The studio and the desk can both see it.");
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
  const navigate = useNavigate();
  const posterKinds = new Set(["poster_vertical", "poster_horizontal", "poster", "thumbnail"]);
  const publish = useMutation({
    mutationFn: (input: { assetId: string; publicFace: boolean }) => setPublicPoster({ data: input }),
    onSuccess: async () => {
      toast.success("Public poster updated.");
      await qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] });
      await qc.invalidateQueries({ queryKey: ["public-posters"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the poster"),
  });
  const wipe = useMutation({
    mutationFn: () => deleteBridgeTitle({ data: { titleId } }),
    onSuccess: async () => {
      toast.success("Title deleted.");
      await navigate({ to: "/dashboard" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete the title"),
  });
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

  function slotRow([kind, label, accept]: (typeof SLOTS)[number]) {
    const item = ready.find((row) => row.kind === kind)
      || (kind === "master" ? ready.find((row) => row.kind === "screener") : undefined)
      || (kind === "poster_vertical" ? ready.find((row) => row.kind === "poster") : undefined);
    const visual = kind === "master" || kind === "trailer";
    return (
      <li key={kind} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted">{item?.byteSize ? `${Math.max(1, Math.round(Number(item.byteSize) / 1024 / 1024))} MB · Saved${item.publicFace ? " · Public" : ""}` : "Not added yet"}</p>
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
        {item && staff && posterKinds.has(kind) ? (
          <button type="button" onClick={() => publish.mutate({ assetId: item.id, publicFace: !item.publicFace })} className="text-sm font-semibold">
            {item.publicFace ? "Hide" : "Public"}
          </button>
        ) : null}
        {item ? <button type="button" onClick={() => remove.mutate(item.id)} className="text-sm font-semibold text-red-700">Remove</button> : null}
      </li>
    );
  }

  return (
    <section className="space-y-5">
      {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm">{notice}</p> : null}
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
        <h2 className="mb-1 text-lg font-semibold">Files</h2>
        <p className="mb-3 text-sm text-muted">
          {ready.some((row) => row.kind === "master" || row.kind === "screener")
            ? "The film is here. Submit when the record is ready. The desk and the studio both get the message."
            : "Add the film when it is ready. You can keep using the desk while it saves."}
        </p>
        <ul className="divide-y divide-line">
          {CORE.map((slot) => slotRow(slot))}
        </ul>
        <button type="button" onClick={() => setOptionalOpen((open) => !open)} className="mt-3 text-sm font-semibold">
          {optionalOpen ? "Hide optional files" : `Add optional files${OPTIONAL.filter(([kind]) => ready.some((row) => row.kind === kind)).length ? ` · ${OPTIONAL.filter(([kind]) => ready.some((row) => row.kind === kind)).length} saved` : ""}`}
        </button>
        {optionalOpen ? (
          <ul className="mt-2 divide-y divide-line">
            {OPTIONAL.map((slot) => slotRow(slot))}
          </ul>
        ) : null}
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
            {actor.internalRole === "super_admin" ? (
              <button
                type="button"
                disabled={wipe.isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${name}”? The title and its files are removed.`)) wipe.mutate();
                }}
                className="rounded-full border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-700"
              >
                {wipe.isPending ? "Deleting…" : "Delete title"}
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

      <TitleProcess titleId={titleId} admin={admin} />

      <DeskOffers titleId={titleId} staff={staff} offers={offers.data?.offers ?? []} />
      {staff && (log.data?.rows.length ?? 0) > 0 ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">Record</h2>
          <ul className="mt-2 divide-y divide-line">
            {groupLog(log.data?.rows ?? []).map((row) => (
              <li key={`${row.action}-${row.at}`} className="flex justify-between gap-3 py-2 text-sm">
                <span>{row.action}{row.count > 1 ? ` (×${row.count})` : ""}</span>
                <span className="text-muted">{row.at.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold">Messages</h2>
        <p className="mt-1 text-sm text-muted">The studio and the desk both see this. A copy also goes by mail.</p>
        {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-xl bg-[#f4f7f8] px-3 py-2 text-sm">Bridge · {notice}</p> : null}
        {(desk.data?.notes.length ?? 0) === 0 && !notice ? (
          <p className="mt-3 rounded-xl bg-[#f4f7f8] px-3 py-3 text-sm">No messages yet. Write here, or submit the title and the update will appear.</p>
        ) : null}
        {(desk.data?.notes.length ?? 0) > 0 ? (
          <ul className="mt-3 space-y-2">
            {desk.data?.notes.filter((item, index, notes) => {
              const previous = notes[index - 1];
              return !previous || previous.action !== item.action || previous.body !== item.body || previous.actor !== item.actor;
            }).map((item) => {
              const mine = item.actor === actor.displayName || item.actor === actor.email;
              const label = ({ upload: "File saved", submit: "Submitted", note: "Message", park: "Parked", approve: "Approved", replace: "Please replace a file" } as Record<string, string>)[item.action] || "Update";
              return (
                <li key={item.id} className={`max-w-[36rem] rounded-2xl px-3 py-2 text-sm ${mine ? "ml-auto bg-[#102433] text-white" : "bg-[#f4f7f8]"}`}>
                  <p className={`text-xs font-semibold ${mine ? "text-white/70" : "text-muted"}`}>{mine ? "You" : item.actor} · {label}</p>
                  <p className="mt-1">{item.body}</p>
                </li>
              );
            })}
          </ul>
        ) : null}
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) act.mutate("note");
          }}
        >
          <label className="text-sm font-semibold">
            Write
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal" placeholder="Ask a question or leave an update" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={act.isPending || !note.trim()} className="rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white">
              {act.isPending ? "Sending…" : "Send"}
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
      </section>
      {player ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setPlayer(null)}>
          <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            {player.visual === "video" ? (
              <DeskVideo url={player.url} />
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

function TitleProcess({ titleId, admin }: { titleId: string; admin: boolean }) {
  const qc = useQueryClient();
  const process = useQuery({ queryKey: ["title-process", titleId], queryFn: () => getTitleProcess({ data: { titleId } }) });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["title-process", titleId] }),
      qc.invalidateQueries({ queryKey: ["bridge-title", titleId] }),
      qc.invalidateQueries({ queryKey: ["bridge-titles"] }),
    ]);
  };
  const run = useMutation({
    mutationFn: async (step: "open" | "check" | "owner" | "verify" | "certify" | "clear") => {
      if (step === "open") return openTitleReview({ data: { titleId } });
      if (step === "clear") return reviewAdminTitle({ data: { titleId, decision: "APPROVE", notes: "Cleared for licensing" } });
      return setClearance({ data: { titleId, step } });
    },
    onSuccess: async () => {
      toast.success("Saved.");
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });
  const row = process.data;
  const status = row?.status ?? "";
  const word = status === "DRAFT" || status === "UPLOADING"
    ? "The files are here. QC is not open yet."
    : status === "PREPARING"
      ? "QC is open. Check the files, the owner, then the preview."
      : status === "QC_REVIEW" || status === "RIGHTS_REVIEW"
        ? "QC is in progress."
        : status === "LICENSING_READY"
          ? "Cleared for licensing. Loop is still closed."
          : status === "LIVE_FOR_BUYERS"
            ? "Listed for buyers. Loop still needs its own authorization."
            : "This record stays where it is until the next check is saved.";
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="text-lg font-semibold">Next</h2>
      <p className="mt-1 text-sm text-muted">{process.isPending ? "Loading…" : word}</p>
      {row ? (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {row.checks.map((item) => (
            <li key={item.label} className="text-sm">
              <span className={item.ok ? "font-semibold" : "text-muted"}>{item.ok ? "Yes" : "No"}</span>
              <span className="text-muted"> · {item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {admin && row ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "DRAFT" || status === "UPLOADING" ? (
            <button type="button" disabled={run.isPending || !row.ready} onClick={() => run.mutate("open")} className="rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Open QC</button>
          ) : null}
          {status === "PREPARING" || status === "QC_REVIEW" ? (
            <>
              <button type="button" disabled={run.isPending || row.checked || !row.ready} onClick={() => run.mutate("check")} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">{row.checked ? "Files checked" : "Check files"}</button>
              <button type="button" disabled={run.isPending || !row.checked || row.ownerVerified} onClick={() => run.mutate("owner")} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">{row.ownerVerified ? "Owner verified" : "Verify owner"}</button>
              <button type="button" disabled={run.isPending || !row.ownerVerified || row.verified} onClick={() => run.mutate("verify")} className="rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">{row.verified ? "Preview verified" : "Verify preview"}</button>
              <button type="button" disabled={run.isPending || !row.verified || row.certified} onClick={() => run.mutate("certify")} className="rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{row.certified ? "QC passed" : "Pass QC"}</button>
            </>
          ) : null}
          {status === "RIGHTS_REVIEW" ? (
            <button type="button" disabled={run.isPending} onClick={() => run.mutate("clear")} className="rounded-full bg-[#102433] px-4 py-2 text-sm font-semibold text-white">Clear for licensing</button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted">Loop is not published from here.</p>
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
