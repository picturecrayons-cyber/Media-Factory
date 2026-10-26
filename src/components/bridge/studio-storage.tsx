import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirmStudioUpload, listStudioFiles, openStudioFile, prepareStudioUpload } from "@/lib/bridge/studio-storage";

const AREAS = [
  {
    id: "working" as const,
    title: "Working",
    note: "Rushes, location stills, and pilot audio. These stay in the studio.",
    slots: [
      { id: "raw" as const, label: "Raw footage" },
      { id: "stills" as const, label: "Location stills" },
      { id: "pilot" as const, label: "Pilot audio" },
    ],
  },
  {
    id: "archive" as const,
    title: "Archive",
    note: "The finished out. Picture, sound, and the catalog.",
    slots: [
      { id: "picture" as const, label: "Final picture" },
      { id: "sound" as const, label: "Final sound" },
      { id: "catalog" as const, label: "Catalog" },
    ],
  },
  {
    id: "keep" as const,
    title: "Keep",
    note: "Paid holding. Files stay private until you release them.",
    slots: [{ id: "hold" as const, label: "Hold" }],
  },
];

const SLOT_LABEL: Record<string, string> = {
  raw: "Raw footage",
  stills: "Stills",
  pilot: "Pilot audio",
  picture: "Final picture",
  sound: "Final sound",
  catalog: "Catalog",
  hold: "Hold",
};

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
        <p className="mt-1 text-sm text-muted">Private. A file stays here until you open the title and add it there.</p>
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
              <p className="mt-1 text-xs leading-5 text-muted">{area.note}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {area.slots.map((slot) => (
                  <label key={slot.id} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                    {upload.isPending ? "Saving…" : slot.label}
                    <input
                      type="file"
                      className="sr-only"
                      disabled={upload.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) upload.mutate({ file, area: area.id, slot: slot.id });
                      }}
                    />
                  </label>
                ))}
              </div>
              <ul className="mt-3 space-y-2">
                {mine.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.titleName}</span>
                      <span className="text-xs text-muted">
                        {SLOT_LABEL[row.slot] || row.slot}
                        {row.day ? ` · Day ${row.day}` : ""}
                        {row.card ? ` · Card ${row.card}` : ""}
                        {row.pending ? " · Saving" : ""}
                      </span>
                    </span>
                    {row.pending ? null : (
                      <button type="button" onClick={() => void view(row.id)} className="shrink-0 text-xs font-semibold">
                        View
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
