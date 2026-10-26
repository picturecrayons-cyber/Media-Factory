import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listGalleryFiles } from "@/lib/bridge/simple-desk";
import { listTitles } from "@/lib/bridge/titles";

export const Route = createFileRoute("/gallery")({ component: Gallery });

function Gallery() {
  return (
    <RequireBridge>
      {(actor) => (
        <BridgeShell actor={actor} title="Library">
          <p className="-mt-2 mb-6 max-w-xl text-sm text-muted">
            Titles in storage. Open one to view or replace the file.
          </p>
          <GalleryGrid home={actor.accountType === "studio" ? "/studio" : "/creator"} showCreate={actor.accountType !== "buyer" || Boolean(actor.internalRole)} />
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
  if (!titles.length) {
    return (
      <p className="text-sm text-muted">
        Nothing stored yet.{" "}
        {showCreate ? <Link to={home} className="font-semibold text-fg">Create a title</Link> : "A cleared title will appear here."}
      </p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {titles.map((title) => {
        const bytes = files.get(title.id) ?? 0;
        return (
          <li key={title.id}>
            <Link
              to="/title/$id"
              params={{ id: title.id }}
              className="block overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-line-strong"
            >
              <div className="grid aspect-[16/10] place-items-center bg-elevated">
                <span className="font-display text-4xl font-semibold tracking-tight text-fg/80">
                  {title.name.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="space-y-2 px-4 py-4">
                <h2 className="font-display text-xl font-semibold leading-tight">{title.name}</h2>
                <p className="text-sm text-muted">
                  {title.language}
                  {title.year ? ` · ${title.year}` : ""}
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  {bytes > 0 ? `In storage · ${Math.max(1, Math.round(bytes / 1024 / 1024))} MB` : "No file yet"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
