import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitleAssets } from "@/lib/bridge/assets";
import { confirmSimpleUpload, deleteTitleAsset, deleteUnfinishedAssets, getSimpleDesk, matchTitleStorage, openTitleAsset, postSimpleDesk, prepareSimpleUpload } from "@/lib/bridge/simple-desk";
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
}: {
  titleId: string;
  actor: BridgeActor;
  name: string;
  synopsis: string;
  status: TitleStatus;
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
  const [note, setNote] = useState("");
  const [editName, setEditName] = useState(name);
  const [editSynopsis, setEditSynopsis] = useState(synopsis);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["simple-desk", titleId] }),
      qc.invalidateQueries({ queryKey: ["bridge-assets", titleId] }),
      qc.invalidateQueries({ queryKey: ["title-poster", titleId] }),
    ]);
  };

  const upload = useMutation({
    mutationFn: async (input: { file: File; kind: "poster_vertical" | "master" | "subtitle" }) => {
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
    mutationFn: () => updateTitle({ data: { id: titleId, name: editName.trim(), synopsis: editSynopsis } }),
    onSuccess: async () => {
      setError("");
      setNotice("Saved.");
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save details"),
  });

  useEffect(() => {
    if (editName.trim() === name && editSynopsis === synopsis) return;
    const timer = window.setTimeout(() => {
      if (editName.trim()) saveEdit.mutate();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [editName, editSynopsis, name, synopsis, saveEdit.mutate]);

  async function view(assetId: string) {
    try {
      const opened = await openTitleAsset({ data: { assetId } });
      window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  const staff = actor.internalRole === "admin" || actor.internalRole === "super_admin" || actor.internalRole === "qc_reviewer";
  const admin = actor.internalRole === "admin" || actor.internalRole === "super_admin";
  const rows = assets.data?.assets ?? [];
  const ready = rows.filter((item) => item.verified);
  const unfinished = rows.filter((item) => item.pending);
  const posters = ready.filter((item) => item.kind === "poster" || item.kind === "poster_vertical").slice(0, 4);
  const previews = useQuery({
    queryKey: ["title-posters", titleId, posters.map((item) => item.id).join(",")],
    enabled: posters.length > 0,
    queryFn: async () => {
      const found = await Promise.all(posters.map(async (item) => {
        try {
          const opened = await openTitleAsset({ data: { assetId: item.id } });
          return opened.url;
        } catch {
          return "";
        }
      }));
      return found.filter(Boolean);
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
    onSuccess: async () => {
      toast.success("Deleted.");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
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

      <div className="grid gap-3">
        <label className="text-sm">
          Title
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-surface px-3 text-base" />
        </label>
        <label className="text-sm">
          Synopsis
          <textarea value={editSynopsis} onChange={(e) => setEditSynopsis(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2" />
        </label>
        <p className="text-xs text-muted">{saveEdit.isPending || upload.isPending ? "Saving…" : "Edits save on their own."}</p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Files</h2>
        <div className="flex flex-wrap gap-2">
          {([
            ["poster_vertical", "Upload poster", "image/*"],
            ["master", "Upload video", "video/*"],
            ["subtitle", "Upload subtitles", ".srt,.vtt,text/vtt"],
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
        {previews.data?.length ? (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {previews.data.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-[2/3] overflow-hidden rounded-xl border border-line">
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        {staff ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={match.isPending} onClick={() => match.mutate()} className="rounded-full border-2 border-[#0b1220] px-3 py-1.5 text-sm font-semibold">
              {match.isPending ? "Checking Oracle…" : "Check storage"}
            </button>
            {admin && unfinished.length ? (
              <button type="button" disabled={clearUnfinished.isPending} onClick={() => clearUnfinished.mutate()} className="rounded-full border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-700">
                {clearUnfinished.isPending ? "Deleting…" : "Delete unfinished"}
              </button>
            ) : null}
          </div>
        ) : null}
        {assets.isError ? <p role="alert" className="mt-3 text-sm text-red-500">{assets.error.message}</p> : null}
        {assets.isPending ? <p className="mt-3 text-sm text-muted">Loading files…</p> : null}
        {!assets.isPending && rows.length === 0 ? <p className="mt-3 text-sm text-muted">No file yet.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {ready.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{KIND_LABEL[item.kind] || item.kind}</p>
                <p className="text-xs text-muted">
                  {item.byteSize ? `${Math.max(1, Math.round(Number(item.byteSize) / 1024 / 1024))} MB` : "Ready"}
                  {" · "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => void view(item.id)} className="rounded-full border border-line px-3 py-1.5 text-sm">View</button>
              {admin ? (
                <button type="button" onClick={() => remove.mutate(item.id)} className="text-sm font-semibold text-red-700">Delete</button>
              ) : null}
            </li>
          ))}
          {unfinished.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{KIND_LABEL[item.kind] || item.kind}</p>
                <p className="text-xs text-muted">Not saved · {new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {admin ? (
                <button type="button" onClick={() => remove.mutate(item.id)} className="text-sm font-semibold text-red-700">Delete</button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

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
    </section>
  );
}
