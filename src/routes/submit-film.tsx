import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CinemaShell } from "@/components/cinema-shell";
import { Button } from "@/components/ui/button";
import { listSubmissions, listTitles, submitFilm } from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/submit-film")({ component: SubmitFilm });

function SubmitFilm() {
  const { user, isPending } = useCurrentUserState();
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const mine = useQuery({
    queryKey: ["submissions"],
    queryFn: () => listSubmissions(),
    enabled: !!user,
  });
  const [form, setForm] = useState({
    title: "",
    titleMl: "",
    language: "Malayalam",
    email: "",
    banner: "",
    screenerUrl: "",
    rightsType: "hybrid",
  });
  const mut = useMutation({
    mutationFn: () => submitFilm({ data: form }),
    onSuccess: (r) => toast(`Film submitted · ref ${r.id}`),
    onError: () => toast("Sign in to submit"),
  });

  if (isPending) {
    return (
      <CinemaShell titles={titles}>
        <main className="px-6 pt-28 text-muted">Loading…</main>
      </CinemaShell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <CinemaShell titles={titles}>
      <main className="mx-auto max-w-xl px-4 pt-24 pb-16 sm:px-6">
        <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Studio submission</p>
        <h1 className="font-display mt-2 text-3xl tracking-wide">Submit film</h1>
        <p className="mt-2 text-sm text-muted">
          Crayons Bridge curatorial intake. Rights window: rent ₹79 / purchase ₹249 per title.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          {(
            [
              ["title", "Movie title", true],
              ["titleMl", "Title in Malayalam", false],
              ["banner", "Banner / production house", false],
              ["email", "Official email", false],
              ["screenerUrl", "Screener / Vimeo link", false],
            ] as const
          ).map(([key, label, required]) => (
            <label key={key} className="block text-xs tracking-wide text-muted uppercase">
              {label}
              <input
                required={required}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm font-normal tracking-normal text-fg normal-case outline-none"
              />
            </label>
          ))}
          <label className="block text-xs tracking-wide text-muted uppercase">
            Language
            <select
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className="mt-1 h-11 w-full rounded-md border border-line bg-elevated px-3 text-sm font-normal tracking-normal text-fg normal-case"
            >
              <option>Malayalam</option>
              <option>Telugu</option>
              <option>Tamil</option>
              <option>Hindi</option>
              <option>English</option>
            </select>
          </label>
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Submitting…" : "Submit film"}
          </Button>
        </form>
        {mine.data?.length ? (
          <ul className="mt-10 space-y-2 text-sm">
            {mine.data.map((s) => (
              <li key={s.id} className="rounded-md border border-line px-3 py-2">
                {s.title} · {s.status} · ref {s.id}
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </CinemaShell>
  );
}
