import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createStoryConceptSubmission } from "@/lib/bridge/story-concept-api";

const GENRES = [
  "Drama",
  "Thriller",
  "Comedy",
  "Romance",
  "Action",
  "Documentary",
  "Horror",
  "Family",
  "Crime",
  "Sci-Fi",
  "Period",
  "Other",
];

const PLATFORMS = [
  "OTT",
  "Theatrical",
  "Broadcast",
  "Festival",
  "International",
  "Investor pitch",
];

export function StoryConceptForm() {
  const navigate = useNavigate();
  const [titleName, setTitleName] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [language, setLanguage] = useState("Malayalam");
  const [genre, setGenre] = useState<string[]>([]);
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);
  const [estimatedBudgetRange, setEstimatedBudgetRange] = useState("");
  const [treatmentUrl, setTreatmentUrl] = useState("");
  const [screenplayUrl, setScreenplayUrl] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      createStoryConceptSubmission({
        data: {
          titleName,
          logline,
          synopsis,
          language,
          genre,
          targetPlatforms,
          estimatedBudgetRange: estimatedBudgetRange || undefined,
          treatmentUrl: treatmentUrl || undefined,
          screenplayUrl: screenplayUrl || undefined,
        },
      }),
    onSuccess: (res) => {
      toast("Story / Concept submitted for review");
      void navigate({ to: "/title/$id", params: { id: res.titleId } });
    },
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Could not submit concept"),
  });

  function toggle(value: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (logline.trim().length < 10) {
      toast("Logline must be at least 10 characters");
      return;
    }
    if (synopsis.trim().length < 40) {
      toast("Synopsis must be at least 40 characters");
      return;
    }
    mut.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">
        Working title
        <input
          required
          value={titleName}
          onChange={(e) => setTitleName(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="Project title"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Logline
        <textarea
          required
          rows={2}
          maxLength={500}
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2"
          placeholder="One or two sentences that sell the concept"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Synopsis
        <textarea
          required
          rows={5}
          maxLength={8000}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line-strong bg-elevated px-3 py-2"
          placeholder="Full story synopsis"
        />
      </label>

      <label className="text-sm">
        Language
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
        >
          {["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        Estimated budget range
        <select
          value={estimatedBudgetRange}
          onChange={(e) => setEstimatedBudgetRange(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
        >
          <option value="">Select a budget range</option>
          <option value="Under 25 Lakhs">Under 25 Lakhs</option>
          <option value="25–50 Lakhs">25–50 Lakhs</option>
          <option value="50 Lakhs – 1 Cr">50 Lakhs – 1 Cr</option>
          <option value="1–3 Cr">1–3 Cr</option>
          <option value="3–10 Cr">3–10 Cr</option>
          <option value="10+ Cr">10+ Cr</option>
        </select>
      </label>

      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Genre</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <label key={g} className="rounded-full border border-line px-3 py-1.5 text-sm">
              <input
                className="mr-2"
                type="checkbox"
                checked={genre.includes(g)}
                onChange={() => toggle(g, genre, setGenre)}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div className="sm:col-span-2">
        <p className="text-sm font-medium">Target platforms / outcome</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="rounded-full border border-line px-3 py-1.5 text-sm">
              <input
                className="mr-2"
                type="checkbox"
                checked={targetPlatforms.includes(p)}
                onChange={() => toggle(p, targetPlatforms, setTargetPlatforms)}
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <label className="text-sm sm:col-span-2">
        Treatment URL (optional)
        <input
          type="url"
          value={treatmentUrl}
          onChange={(e) => setTreatmentUrl(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="https://…"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        Screenplay URL (optional)
        <input
          type="url"
          value={screenplayUrl}
          onChange={(e) => setScreenplayUrl(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="https://…"
        />
      </label>

      <div className="rounded-xl border border-line bg-elevated p-4 text-xs leading-relaxed text-muted sm:col-span-2">
        Submitting places this concept in the admin curation queue. It does not publish to
        Loop or the public buyer catalog. Payment gate remains locked until the fee is
        certified.
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={mut.isPending} className="w-full rounded-full sm:w-auto sm:px-8">
          {mut.isPending ? "Submitting…" : "Submit to Network"}
        </Button>
      </div>
    </form>
  );
}
