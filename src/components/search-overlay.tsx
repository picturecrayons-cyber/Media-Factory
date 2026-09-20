import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useCinemaUI } from "@/lib/cinema-ui";
import type { Title } from "@/lib/catalog";

export function SearchOverlay({ titles }: { titles: Title[] }) {
  const { searchOpen, setSearchOpen, query, setQuery } = useCinemaUI();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !searchOpen) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, setSearchOpen]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return titles.slice(0, 8);
    return titles.filter((t) =>
      [t.title, t.director, t.cast, t.language, t.synopsis, ...t.genres]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, titles]);

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg/92 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl px-4 pt-24">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-elevated px-4">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, directors, languages"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
          />
          <button
            type="button"
            className="grid size-11 place-items-center text-muted"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="mt-4 space-y-1">
          {hits.map((t) => (
            <li key={t.id}>
              <Link
                to="/title/$slug"
                params={{ slug: t.slug }}
                onClick={() => setSearchOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-fg/8"
              >
                <img
                  src={t.posterPath}
                  alt=""
                  className="h-14 w-10 rounded-sm object-cover"
                  crossOrigin="anonymous"
                />
                <div>
                  <p className="text-sm">{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.year} · {t.language} · {t.maturityRating}
                  </p>
                </div>
              </Link>
            </li>
          ))}
          {!hits.length ? (
            <li className="px-2 py-8 text-center text-sm text-muted">No titles match.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
