import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateTitle } from "@/lib/bridge/titles";
import type { BridgeTitle } from "@/lib/bridge/types";

function splitValues(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function FinishedFilmMetadataEditor({
  title,
  editable,
}: {
  title: BridgeTitle;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState(title.language ?? "");
  const [runtime, setRuntime] = useState(title.runtimeMinutes ? String(title.runtimeMinutes) : "");
  const [genres, setGenres] = useState((title.genres ?? []).join(", "));
  const [director, setDirector] = useState(
    title.credits.filter((credit) => credit.role.trim().toUpperCase() === "DIRECTOR").map((credit) => credit.name).join(", "),
  );
  const [cast, setCast] = useState(
    title.credits.filter((credit) => ["CAST", "ACTOR", "ACTRESS"].includes(credit.role.trim().toUpperCase())).map((credit) => credit.name).join(", "),
  );

  const save = useMutation({
    mutationFn: () => updateTitle({
      data: {
        id: title.id,
        language: language.trim(),
        runtimeMinutes: Number(runtime),
        genres: splitValues(genres),
        director: director.trim(),
        cast: splitValues(cast),
      },
    }),
    onSuccess: () => {
      toast.success("Finished Film metadata saved");
      void queryClient.invalidateQueries({ queryKey: ["bridge-title", title.id] });
      void queryClient.invalidateQueries({ queryKey: ["bridge-titles"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save metadata"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!language.trim() || !Number.isInteger(Number(runtime)) || Number(runtime) <= 0 ||
        !splitValues(genres).length || !director.trim() || !splitValues(cast).length) {
      toast.error("Complete Language, Runtime, Genre, Director and Cast before saving");
      return;
    }
    save.mutate();
  }

  return (
    <section className="mt-5 rounded-xl border border-line bg-elevated/30 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Required Finished Film metadata</h3>
        <p className="mt-1 text-xs text-muted">
          These fields must be complete before the title can be submitted for QC.
        </p>
      </div>
      {editable ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Language *
            <input required value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
          </label>
          <label className="text-sm">Runtime (minutes) *
            <input required type="number" min="1" max="600" step="1" value={runtime} onChange={(event) => setRuntime(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
          </label>
          <label className="text-sm sm:col-span-2">Genre(s) *
            <input required value={genres} onChange={(event) => setGenres(event.target.value)} placeholder="Drama, Thriller" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
            <span className="mt-1 block text-xs text-muted">Separate multiple genres with commas.</span>
          </label>
          <label className="text-sm">Director *
            <input required value={director} onChange={(event) => setDirector(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
          </label>
          <label className="text-sm">Cast *
            <input required value={cast} onChange={(event) => setCast(event.target.value)} placeholder="Actor 1, Actor 2" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3" />
            <span className="mt-1 block text-xs text-muted">Separate names with commas.</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending} className="rounded-full px-5">
              {save.isPending ? "Saving…" : "Save required metadata"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Language</span> · {title.language || "Missing"}</p>
          <p><span className="text-muted">Runtime</span> · {title.runtimeMinutes ? `${title.runtimeMinutes} min` : "Missing"}</p>
          <p><span className="text-muted">Genres</span> · {title.genres?.join(", ") || "Missing"}</p>
          <p><span className="text-muted">Director</span> · {director || "Missing"}</p>
          <p className="sm:col-span-2"><span className="text-muted">Cast</span> · {cast || "Missing"}</p>
          <p className="text-xs text-muted sm:col-span-2">Metadata editing is locked after preparation. Ask an authorized Bridge administrator to correct it.</p>
        </div>
      )}
    </section>
  );
}
