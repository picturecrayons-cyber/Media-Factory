import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmSimpleUpload, getSimpleDesk, postSimpleDesk, prepareSimpleUpload } from "@/lib/bridge/simple-desk";
import { advanceTitle, updateTitle } from "@/lib/bridge/titles";
import { nextStatus } from "@/lib/bridge/lifecycle";
import { supabase } from "@/lib/supabase";
import type { BridgeActor } from "@/lib/bridge/session";
import type { TitleStatus } from "@/lib/bridge/types";

const MAX_BYTES = 200 * 1024 * 1024;

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
  const [note, setNote] = useState("");
  const [editName, setEditName] = useState(name);
  const [editSynopsis, setEditSynopsis] = useState(synopsis);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["simple-desk", titleId] });
  const say = (mailed: boolean, what: string) => {
    setError("");
    setNotice(mailed ? `${what} Saved in the app and sent by mail.` : `${what} Saved in the app.`);
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Keep the file under 200 MB.");
      const contentType = file.type || "application/octet-stream";
      const prepared = await prepareSimpleUpload({
        data: { titleId, filename: file.name, contentType, byteSize: file.size },
      });
      const sent = await supabase.storage.from(prepared.bucket).upload(prepared.path, file, {
        contentType,
        upsert: false,
      });
      if (sent.error) throw new Error(sent.error.message);
      return confirmSimpleUpload({
        data: { titleId, path: prepared.path, contentType, byteSize: file.size },
      });
    },
    onSuccess: async (res) => {
      say(res.mailed, "Upload succeeded.");
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Upload failed"),
  });

  const act = useMutation({
    mutationFn: (action: "park" | "approve" | "replace" | "note") =>
      postSimpleDesk({ data: { titleId, action, body: note || action } }),
    onSuccess: async (res, action) => {
      setNote("");
      say(res.mailed, action === "note" ? "Message sent." : "Decision saved.");
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save"),
  });

  const next = nextStatus(status);
  const stepLabel = status === "DRAFT" ? "Start" : status === "UPLOADING" ? "Continue" : status === "PREPARING" ? "Submit" : "";
  const send = useMutation({
    mutationFn: () => advanceTitle({ data: { id: titleId, to: next! } }),
    onSuccess: async () => {
      setError("");
      setNotice("Sent.");
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not send"),
  });

  const saveEdit = useMutation({
    mutationFn: () => updateTitle({ data: { id: titleId, name: editName, synopsis: editSynopsis } }),
    onSuccess: async () => {
      setError("");
      setNotice("Title details saved.");
      await qc.invalidateQueries({ queryKey: ["bridge-title", titleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save details"),
  });

  async function view() {
    const file = desk.data?.file;
    if (!file) return;
    const signed = await supabase.storage.from(BUCKET(desk.data?.bucket)).createSignedUrl(file.path, 600);
    if (signed.error || !signed.data?.signedUrl) {
      setError(signed.error?.message || "Could not open the file");
      return;
    }
    window.open(signed.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const staff = actor.internalRole === "admin" || actor.internalRole === "super_admin" || actor.internalRole === "qc_reviewer";
  const file = desk.data?.file;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-xl">File</h2>
      </div>
      {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      {desk.isError ? <p role="alert" className="text-sm text-red-500">{desk.error.message}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
          {upload.isPending ? "Uploading…" : file ? "Replace file" : "Upload file"}
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
        {file ? (
          <button type="button" onClick={() => void view()} className="rounded-full border border-line px-4 py-2 text-sm">
            View
          </button>
        ) : null}
        {stepLabel && next ? (
          <button type="button" disabled={send.isPending} onClick={() => send.mutate()} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
            {send.isPending ? "Sending…" : stepLabel}
          </button>
        ) : null}
      </div>
      {file ? (
        <p className="text-xs text-muted">
          {Math.max(1, Math.round(file.byteSize / 1024 / 1024))} MB · {new Date(file.createdAt).toLocaleString()}
        </p>
      ) : null}

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveEdit.mutate();
        }}
      >
        <label className="text-sm">
          Title
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-elevated px-3" required />
        </label>
        <label className="text-sm">
          Synopsis
          <textarea value={editSynopsis} onChange={(e) => setEditSynopsis(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2" />
        </label>
        <button type="submit" disabled={saveEdit.isPending} className="w-fit rounded-full border border-line px-4 py-2 text-sm">
          {saveEdit.isPending ? "Saving…" : "Save edit"}
        </button>
      </form>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) act.mutate("note");
        }}
      >
        <label className="text-sm">
          Message
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line bg-elevated px-3 py-2" placeholder="Write to the other side" />
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

      <ul className="space-y-2">
        {(desk.data?.notes ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <p className="font-semibold">{item.action} · {item.actor}</p>
            <p className="text-muted">{item.body}</p>
            <p className="text-xs text-muted">{item.mailed ? "Mailed" : "In app"} · {new Date(item.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BUCKET(name: string | undefined) {
  return name || "bridge-simple";
}
