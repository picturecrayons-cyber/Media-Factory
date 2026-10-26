import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmStudioUpload, listStudioFiles, openStudioFile, prepareStudioUpload } from "@/lib/bridge/studio-storage";

function mb(bytes: number | undefined) {
  const value = Number(bytes ?? 0);
  if (value <= 0) return "0 MB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${Math.max(1, Math.round(value / 1024 / 1024))} MB`;
}

const AREAS = [
  {
    id: "working" as const,
    title: "Working",
    note: "Rushes stay in the studio.",
    slots: [
      { id: "raw" as const, label: "Raw footage" },
      { id: "stills" as const, label: "Location stills" },
      { id: "pilot" as const, label: "Pilot audio" },
    ],
  },
  {
    id: "archive" as const,
    title: "Archive",
    note: "Finished picture, sound, and the catalog.",
    slots: [
      { id: "picture" as const, label: "Final picture" },
      { id: "sound" as const, label: "Final sound" },
      { id: "catalog" as const, label: "Catalog" },
    ],
  },
  {
    id: "keep" as const,
    title: "Keep",
    note: "Paid. Private until you release it.",
    slots: [{ id: "hold" as const, label: "Hold" }],
  },
];

export function StudioStorage() {
  const qc = useQueryClient();
  const files = useQuery({ queryKey: ["studio-files"], queryFn: () => listStudioFiles() });
  const [titleName, setTitleName] = useState("");
  const [day, setDay] = useState("");
  const [card, setCard] = useState("");
  const [error, setError] = useState("");

  const upload = useMutation({
    mutationFn: async (input: { file: File; area: "working" | "archive" | "keep"; slot: "raw" | "stills" | "pilot" | "picture" | "sound" | "catalog" | "hold" }) => {
      if (!titleName.trim()) throw new Error("Name the film first.");
      if (input.file.size > 200 * 1024 * 1024) throw new Error("Keep the file under 200 MB.");
      const prepared = await prepareStudioUpload({
        data: {
          titleName: titleName.trim(),
          area: input.area,
          slot: input.slot,
          day: day.trim() || undefined,
          card: card.trim() || undefined,
          filename: input.file.name,
          contentType: input.file.type || "application/octet-stream",
          byteSize: input.file.size,
        },
      });
      const sent = await fetch(prepared.url, {
        method: "PUT",
        body: input.file,
        headers: { "content-type": input.file.type || "application/octet-stream" },
      });
      if (!sent.ok) throw new Error(`Upload failed (${sent.status})`);
      return confirmStudioUpload({ data: { id: prepared.id } });
    },
    onSuccess: async () => {
      setError("");
      toast.success("Saved in your storage.");
      await qc.invalidateQueries({ queryKey: ["studio-files"] });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Could not save";
      setError(message);
      toast.error(message);
    },
  });

  async function view(id: string) {
    try {
      const opened = await openStudioFile({ data: { id } });
      window.open(opened.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file");
    }
  }

  const rows = files.data?.files ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Studio storage</h2>
        <p className="mt-1 text-sm text-muted">
          {files.isPending ? "Checking storage…" : `${mb(files.data?.usedBytes)} in private storage · ${mb(files.data?.titleBytes)} on titles`}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={titleName} onChange={(e) => setTitleName(e.target.value)} placeholder="Film name" className="h-11 rounded-xl border border-line bg-white px-3 text-sm" />
        <input value={day} onChange={(e) => setDay(e.target.value)} placeholder="Day" className="h-11 rounded-xl border border-line bg-white px-3 text-sm" />
        <input value={card} onChange={(e) => setCard(e.target.value)} placeholder="Card" className="h-11 rounded-xl border border-line bg-white px-3 text-sm" />
      </div>
      {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {AREAS.map((area) => {
          const mine = rows.filter((row) => row.area === area.id);
          return (
            <article key={area.id} className="rounded-2xl border border-line bg-white p-4">
              <h3 className="font-semibold">{area.title}</h3>
              <p className="mt-1 text-xs text-muted">{mine.length ? `${mine.length} saved` : "Nothing saved"}</p>
              <ul className="mt-3 divide-y divide-line">
                {area.slots.map((slot) => {
                  const saved = mine.filter((row) => row.slot === slot.id);
                  return (
                    <li key={slot.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{slot.label}</span>
                        <span className="block truncate text-xs text-muted">{saved[0] ? saved[0].titleName : "Empty"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {saved[0] && !saved[0].pending ? <button type="button" onClick={() => void view(saved[0].id)} className="text-xs font-semibold">View</button> : null}
                        <label className="cursor-pointer text-xs font-semibold">
                          {saved.length ? "Replace" : "Add"}
                          <input type="file" className="sr-only" disabled={upload.isPending} onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) upload.mutate({ file, area: area.id, slot: slot.id });
                          }} />
                        </label>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
