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
  const [rightsHolderName, setRightsHolderName] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [thirdPartyMaterialsIncluded, setThirdPartyMaterialsIncluded] = useState<boolean | null>(null);
  const [rightsDeclarationAccepted, setRightsDeclarationAccepted] = useState(false);

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
          rightsHolderName,
          rightsBasis: rightsBasis as "ORIGINAL_AUTHOR" | "ASSIGNED" | "LICENSED" | "PUBLIC_DOMAIN" | "OTHER",
          thirdPartyMaterialsIncluded: thirdPartyMaterialsIncluded === true,
          rightsDeclarationAccepted: true,
        },
      }),
    onSuccess: () => {
      toast("Story / Concept submitted for review");
      void navigate({ to: "/workspace" });
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
    if (!rightsHolderName.trim() || !rightsBasis || thirdPartyMaterialsIncluded === null || !rightsDeclarationAccepted) {
      toast("Complete and accept the rights declaration before submitting");
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
        <input
          value={estimatedBudgetRange}
          onChange={(e) => setEstimatedBudgetRange(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
          placeholder="e.g. under 1 Cr / 1–3 Cr / 3–10 Cr"
        />
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

      <p className="text-xs text-muted sm:col-span-2">
        Private treatment and screenplay uploads will be enabled only through Bridge-controlled storage. Do not paste public document links here.
      </p>

      <div className="sm:col-span-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-semibold">Author & rights declaration</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          The author identity is linked to the signed-in Bridge Creator / Studio profile. Provide the rights holder and declaration for this story submission.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Rights holder name
            <input
              required
              value={rightsHolderName}
              onChange={(e) => setRightsHolderName(e.target.value)}
              maxLength={200}
              className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
              placeholder="Name of author / rights holder"
            />
          </label>
          <label className="text-sm">
            Rights basis
            <select
              required
              value={rightsBasis}
              onChange={(e) => setRightsBasis(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
            >
              <option value="">Select rights basis</option>
              <option value="ORIGINAL_AUTHOR">Original author</option>
              <option value="ASSIGNED">Rights assigned</option>
              <option value="LICENSED">Licensed rights</option>
              <option value="PUBLIC_DOMAIN">Public domain</option>
              <option value="OTHER">Other (requires legal review)</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Does this submission include third-party material?
            <select
              required
              value={thirdPartyMaterialsIncluded === null ? "" : thirdPartyMaterialsIncluded ? "yes" : "no"}
              onChange={(e) => setThirdPartyMaterialsIncluded(e.target.value === "" ? null : e.target.value === "yes")}
              className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-elevated px-3"
            >
              <option value="">Select yes or no</option>
              <option value="no">No third-party material</option>
              <option value="yes">Yes, third-party material is included</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={rightsDeclarationAccepted}
              onChange={(e) => setRightsDeclarationAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm that the rights-holder and rights-basis information is accurate, and that I am the author / rights holder or have authority to submit this material for review. I understand this submission is not a film licence or a Loop publication.
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-elevated p-4 text-xs leading-relaxed text-muted sm:col-span-2">
        Submitting places this concept in the admin curation queue. It does not publish to
        Loop or the public buyer catalog. Payment gate remains locked until the fee is
        certified.
      </div>

      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={mut.isPending || !rightsHolderName.trim() || !rightsBasis || thirdPartyMaterialsIncluded === null || !rightsDeclarationAccepted}
          className="w-full rounded-full sm:w-auto sm:px-8"
        >
          {mut.isPending ? "Submitting…" : "Submit to Network"}
        </Button>
      </div>
    </form>
  );
}
