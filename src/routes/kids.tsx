import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CinemaShell } from "@/components/cinema-shell";
import { PinGate } from "@/components/pin-gate";
import { PosterCard } from "@/components/poster-card";
import { listTitles } from "@/lib/cinema";
import { CATALOG, isKidsSafe } from "@/lib/catalog";
import { useCinemaUI } from "@/lib/cinema-ui";
import { getConfig } from "@/lib/cinema";

export const Route = createFileRoute("/kids")({ component: Kids });

function Kids() {
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const configQ = useQuery({ queryKey: ["config"], queryFn: () => getConfig() });
  const titles = (titlesQ.data?.length ? titlesQ.data : CATALOG).filter(isKidsSafe);
  const setKids = useCinemaUI((s) => s.setKidsMode);
  const [gate, setGate] = useState(false);

  return (
    <CinemaShell titles={titles} allowKids>
      <main className="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.22em] text-ok uppercase">Crayons Loop Kids</p>
            <h1 className="font-display mt-2 text-3xl tracking-wide">
              {configQ.data?.config.kidsLabel ?? "U-Rated Safe Cinema"}
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted">
              Curated family catalogue. Parental gate required to leave.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGate(true)}
            className="h-11 rounded-md border border-line px-4 text-sm"
          >
            Exit Kids portal
          </button>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {titles.map((t) => (
            <PosterCard key={t.id} title={t} />
          ))}
        </div>
        {!titles.length ? (
          <p className="mt-10 text-sm text-muted">
            No safe titles available.{" "}
            <Link to="/" className="underline">
              Return
            </Link>
          </p>
        ) : null}
      </main>
      {gate ? (
        <PinGate
          onCancel={() => setGate(false)}
          onValid={() => {
            setKids(false);
            setGate(false);
            window.location.href = "/";
          }}
        />
      ) : null}
    </CinemaShell>
  );
}
