import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTitleAssets } from "@/lib/bridge/assets";
import { confirmSimpleUpload, getSimpleDesk, openTitleAsset, postSimpleDesk, prepareSimpleUpload } from "@/lib/bridge/simple-desk";
import { updateTitle } from "@/lib/bridge/titles";
import type { BridgeActor } from "@/lib/bridge/session";

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

function kindFor(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "poster_vertical" as const;
  if (name.endsWith(".srt") || name.endsWith(".vtt")) return "subtitle" as const;
  if (file.type.startsWith("video/")) return "master" as const;
  return "master" as const;
}

export function SimpleDesk({
  titleId,
  actor,
  name,
  synopsis,
}: {
  titleId: string;
  actor: BridgeActor;
  name: string;
  synopsis: string;
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
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Keep the file under 200 MB.");
      const contentType = file.type || "application/octet-stream";
      const kind = kindFor(file);
      const prepared = await prepareSimpleUpload({
        data: { titleId, filename: file.name, contentType, byteSize: file.size, kind },
      });
      const sent = await fetch(prepared.url, {
        method: "PUT",
        body: file,
        headers: { "content-type": contentType },
      });
      if (!sent.ok) throw new Error(`Upload failed (${sent.status})`);
      return confirmSimpleUpload({
        data: { titleId, path: prepared.path, contentType, byteSize: file.size, kind },
      });
    },
    onSuccess: async () => {
      setError("");
      setNotice("Saved.");
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Upload failed"),
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
  const rows = assets.data?.assets ?? [];

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Files</h2>
          <label className="cursor-pointer rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
            {upload.isPending ? "Saving…" : "Upload"}
            <input
              type="file"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                const next = e.target.files?.[0];
                e.target.value = "";
                if (next) upload.mutate(next);
              }}
            />
          </label>
        </div>
        {assets.isError ? <p role="alert" className="mt-3 text-sm text-red-500">{assets.error.message}</p> : null}
        {assets.isPending ? <p className="mt-3 text-sm text-muted">Loading files…</p> : null}
        {!assets.isPending && rows.length === 0 ? <p className="mt-3 text-sm text-muted">No file yet.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {rows.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{KIND_LABEL[item.kind] || item.kind}</p>
                <p className="text-xs text-muted">
                  {item.pending ? "Pending" : item.byteSize ? `${Math.max(1, Math.round(Number(item.byteSize) / 1024 / 1024))} MB` : "Ready"}
                  {" · "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              {item.verified ? (
                <button type="button" onClick={() => void view(item.id)} className="rounded-full border border-line px-3 py-1.5 text-sm">
                  View
                </button>
              ) : (
                <span className="text-xs text-muted">Saving</span>
              )}
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
