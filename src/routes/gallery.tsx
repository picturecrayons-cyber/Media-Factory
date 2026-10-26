import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listGalleryFiles } from "@/lib/bridge/simple-desk";
import { listTitles } from "@/lib/bridge/titles";
import type { BridgeTitle } from "@/lib/bridge/types";

export const Route = createFileRoute("/gallery")({ component: Gallery });

const PLATES = [
  ["#102433", "#0a6f8a"],
  ["#1b2433", "#24586a"],
  ["#141c28", "#0e4c5c"],
  ["#1a2230", "#3d6d7c"],
  ["#101820", "#126078"],
  ["#1c2630", "#1d4e5c"],
] as const;

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  UPLOADING: "Uploading",
  PREPARING: "Preparing",
  QC_REVIEW: "In review",
  RIGHTS_REVIEW: "Rights",
  LICENSING_READY: "Ready",
  LIVE_FOR_BUYERS: "Live",
  IN_NEGOTIATION: "Negotiation",
  LICENSED: "Licensed",
  DELIVERED: "Delivered",
};

function plate(name: string) {
  let n = 0;
  for (const char of name) n = (n + char.charCodeAt(0)) % PLATES.length;
  return PLATES[n];
}

function Gallery() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Library">
          <GalleryGrid
            home={actor.accountType === "studio" ? "/studio" : "/creator"}
            showCreate={actor.accountType !== "buyer" || Boolean(actor.internalRole)}
          />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function GalleryGrid({ home, showCreate }: { home: "/creator" | "/studio"; showCreate: boolean }) {
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const filesQ = useQuery({ queryKey: ["gallery-files"], queryFn: () => listGalleryFiles() });
  if (titlesQ.isPending) return <p className="text-sm text-muted">Opening the library…</p>;
  if (titlesQ.isError) return <p role="alert" className="text-sm text-red-500">The library could not be opened.</p>;
  const files = new Map((filesQ.data?.files ?? []).map((file) => [file.titleId, file.byteSize]));
  const titles = titlesQ.data?.titles ?? [];
  const stored = titles.filter((title) => (files.get(title.id) ?? 0) > 0).length;
  if (!titles.length) {
    return (
      <div className="overflow-hidden rounded-3xl border border-line">
        <div className="grid min-h-64 place-items-end bg-[linear-gradient(160deg,#102433,#0e4c5c)] p-8">
          <div>
            <p className="font-display text-3xl font-semibold text-white">The library is empty.</p>
            <p className="mt-2 text-sm text-white/70">
              {showCreate ? <Link to={home} className="font-semibold text-white underline">Create a title</Link> : "A cleared title will appear here."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="-mt-3 mb-5 text-sm text-muted">
        {titles.length} {titles.length === 1 ? "title" : "titles"}
        {stored ? ` · ${stored} in storage` : ""}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {titles.map((title) => (
          <Poster key={title.id} title={title} bytes={files.get(title.id) ?? 0} />
        ))}
      </ul>
    </div>
  );
}

function Poster({ title, bytes }: { title: BridgeTitle; bytes: number }) {
  const [ink, wash] = plate(title.name);
  const meta = [title.language, title.year, title.runtimeMinutes ? `${title.runtimeMinutes} min` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <Link
        to="/title/$id"
        params={{ id: title.id }}
        className="group block"
        aria-label={title.name}
      >
        <article
          className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-line shadow-[0_12px_32px_rgba(16,32,48,0.08)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(16,32,48,0.16)]"
          style={{ background: `linear-gradient(165deg, ${wash} 0%, ${ink} 58%)` }}
        >
          <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <p className="absolute left-3 top-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {STATUS[title.status] ?? title.status}
          </p>
          {bytes > 0 ? (
            <p className="absolute right-3 top-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
              File
            </p>
          ) : null}
          <p className="pointer-events-none absolute inset-x-0 top-[28%] text-center font-display text-7xl font-semibold text-white/10">
            {title.name.slice(0, 1).toUpperCase()}
          </p>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3.5 pt-16 sm:p-4">
            <h2 className="font-display text-lg font-semibold leading-tight text-white sm:text-xl">{title.name}</h2>
            {title.nameMl ? <p className="mt-0.5 truncate text-xs text-white/70">{title.nameMl}</p> : null}
            <p className="mt-1.5 text-xs text-white/75">{meta}</p>
          </div>
        </article>
      </Link>
    </li>
  );
}
