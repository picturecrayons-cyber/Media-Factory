import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { getBearerToken } from "@/lib/auth/client";
import { listTitles } from "@/lib/bridge/titles";
import {
  createLicenseOrder,
  listOwnEntitlements,
  verifyLicensePayment,
} from "@/lib/bridge/payments";

export const Route = createFileRoute("/buyer")({ component: Buyer });

type RzCtor = new (opts: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  handler: (res: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss: () => void };
}) => { open: () => void };

function loadRazorpay(): Promise<RzCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RzCtor };
    if (w.Razorpay) {
      resolve(w.Razorpay);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RzCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay checkout missing"));
    };
    s.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.head.appendChild(s);
  });
}

function Buyer() {
  return (
    <RequireBridge allow="buyer">
      {(actor) => (
        <BridgeShell actor={actor} title="Buyer dashboard">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Discover licensing-ready titles, open a listing, then license only after captured payment.
          </p>
          <BuyerBody userId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

const BUYER_GALLERY_PAGE_SIZE = 24;
const MAX_POSTER_PAGE_BYTES = 40 * 1024 * 1024;

async function fetchBuyerPosterArtwork(
  titleIds: string[],
  signal: AbortSignal,
): Promise<Map<string, Blob>> {
  const token = await getBearerToken();
  if (!token) throw new Error("A valid buyer session is required to load poster artwork.");

  const posters = new Map<string, Blob>();
  let nextIndex = 0;
  let reservedBytes = 0;
  const workerCount = Math.min(6, titleIds.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < titleIds.length) {
        if (signal.aborted) throw new DOMException("Poster loading was cancelled.", "AbortError");
        const titleId = titleIds[nextIndex++];
        let response: Response;
        try {
          response = await fetch(
            `/api/buyer/poster?titleId=${encodeURIComponent(titleId)}`,
            {
              method: "GET",
              credentials: "same-origin",
              headers: { Authorization: `Bearer ${token}` },
              signal,
            },
          );
        } catch (error) {
          if (signal.aborted) throw error;
          continue;
        }

        if (response.status === 404) continue;
        if (response.status === 401 || response.status === 403) {
          throw new Error("Buyer session is not authorized to load poster artwork.");
        }
        if (!response.ok) continue;

        const contentType = (response.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) continue;

        const contentLength = Number(response.headers.get("content-length") ?? "");
        if (
          !Number.isFinite(contentLength) ||
          contentLength <= 0 ||
          contentLength > 20 * 1024 * 1024 ||
          reservedBytes + contentLength > MAX_POSTER_PAGE_BYTES
        ) {
          continue;
        }
        reservedBytes += contentLength;

        try {
          const image = await response.blob();
          if (image.size === contentLength) posters.set(titleId, image);
          else reservedBytes -= contentLength;
        } catch (error) {
          reservedBytes -= contentLength;
          if (signal.aborted) throw error;
          // One failed poster must not discard successful artwork for other films.
        }
      }
    }),
  );
  return posters;
}

async function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. Retry to check the service again.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function BuyerBody({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "listing" | "licenses">("discover");
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"recent" | "title">("recent");
  const [galleryPage, setGalleryPage] = useState(0);
  // Buyer-sensitive responses must never share a React Query cache entry across accounts.
  const titlesKey = ["bridge-buyer-titles", userId] as const;
  const entitlementsKey = ["bridge-buyer-entitlements", userId] as const;
  const titlesQ = useQuery({
    queryKey: titlesKey,
    queryFn: () => withTimeout(listTitles(), "Buyer catalogue"),
    retry: 1,
  });
  const titles = titlesQ.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const languages = [...new Set(titles.map((title) => title.language.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visible = titles
    .filter((t) => (!needle || `${t.name} ${t.language} ${t.synopsis}`.toLowerCase().includes(needle)) && (languageFilter === "all" || t.language === languageFilter))
    .sort((a, b) => sortOrder === "title" ? a.name.localeCompare(b.name) : 0);
  const pageCount = Math.max(1, Math.ceil(visible.length / BUYER_GALLERY_PAGE_SIZE));
  const currentPage = Math.min(galleryPage, pageCount - 1);
  const pageTitles = visible.slice(
    currentPage * BUYER_GALLERY_PAGE_SIZE,
    (currentPage + 1) * BUYER_GALLERY_PAGE_SIZE,
  );
  const posterTitleIds = pageTitles.map((title) => title.id);
  const postersQ = useQuery({
    queryKey: ["bridge-buyer-poster-artwork", userId, posterTitleIds],
    queryFn: ({ signal }) =>
      withTimeout(fetchBuyerPosterArtwork(posterTitleIds, signal), "Buyer artwork", 120_000),
    enabled: tab !== "licenses" && view === "gallery" && posterTitleIds.length > 0,
    retry: 1,
  });
  const entQ = useQuery({
    queryKey: entitlementsKey,
    queryFn: () => withTimeout(listOwnEntitlements(), "Buyer licenses"),
    retry: 1,
  });
  const entitled = new Set(entQ.data?.entitlements.map((e) => e.titleId));
  const order = useMutation({
    mutationFn: async (titleId: string) => {
      const created = await createLicenseOrder({
        data: { titleId, idempotencyKey: `lic-${titleId}-${Date.now()}` },
      });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const ck = new Razorpay({
          key: created.keyId,
          amount: created.amountPaise,
          currency: created.currency,
          order_id: created.orderId,
          modal: {
            ondismiss: () => reject(new Error("Checkout closed before payment verification. No license was granted.")),
          },
          handler: (res) => {
            void verifyLicensePayment({
              data: {
                orderId: res.razorpay_order_id,
                paymentId: res.razorpay_payment_id,
                signature: res.razorpay_signature,
              },
            })
              .then(() => resolve())
              .catch(reject);
          },
        });
        ck.open();
      });
    },
    onSuccess: () => {
      toast("Payment captured — entitlement recorded");
      void qc.invalidateQueries({ queryKey: titlesKey });
      void qc.invalidateQueries({ queryKey: entitlementsKey });
      setTab("licenses");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment did not complete"),
  });

  const licensed = visible.filter((t) => entitled.has(t.id));
  const artworkByTitle = postersQ.data ?? new Map<string, Blob>();
  if (titlesQ.isPending || entQ.isPending) {
    return <p role="status" aria-live="polite">Loading your Buyer catalogue and licenses…</p>;
  }
  if (titlesQ.isError || entQ.isError) {
    return (
      <section role="alert" className="space-y-3 rounded-sm border border-line p-4">
        <p className="font-medium">Buyer data could not be loaded.</p>
        {titlesQ.isError ? <p className="text-sm text-muted">Catalogue: {titlesQ.error.message}</p> : null}
        {entQ.isError ? <p className="text-sm text-muted">Licenses: {entQ.error.message}</p> : null}
        <button
          type="button"
          className="underline"
          onClick={() => void Promise.all([titlesQ.refetch(), entQ.refetch()])}
        >
          Retry both checks
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Discover" value={String(titles.length)} note="Live for buyers" />
        <Stat label="Listing" value={String(visible.length)} note="Matching this search" />
        <Stat label="Licenses" value={String(licensed.length)} note="Captured entitlements" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["discover", "listing", "licenses"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-sm border px-3 py-1.5 text-sm capitalize ${tab === id ? "border-accent text-accent" : "border-line text-muted"}`}>
            {id}
          </button>
        ))}
      </div>
      {tab !== "licenses" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="buyer-catalogue-search">Search catalogue</label>
          <input id="buyer-catalogue-search" value={query} onChange={(e) => { setQuery(e.target.value); setGalleryPage(0); }} placeholder="Search title, language or synopsis" className="w-full max-w-md rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
          <label className="sr-only" htmlFor="buyer-language-filter">Filter by language</label>
          <select id="buyer-language-filter" value={languageFilter} onChange={(e) => { setLanguageFilter(e.target.value); setGalleryPage(0); }} className="min-h-10 rounded-sm border border-line bg-surface px-3 py-2 text-sm">
            <option value="all">All languages</option>
            {languages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
          <label className="sr-only" htmlFor="buyer-sort-order">Sort catalogue</label>
          <select id="buyer-sort-order" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value as "recent" | "title"); setGalleryPage(0); }} className="min-h-10 rounded-sm border border-line bg-surface px-3 py-2 text-sm">
            <option value="recent">Default order</option>
            <option value="title">Title A–Z</option>
          </select>
          {(query || languageFilter !== "all" || sortOrder !== "recent") ? <button type="button" onClick={() => { setQuery(""); setLanguageFilter("all"); setSortOrder("recent"); setGalleryPage(0); }} className="min-h-10 px-2 text-sm font-semibold text-accent hover:underline">Clear filters</button> : null}
          <div className="inline-flex rounded-sm border border-line p-1" role="group" aria-label="Catalogue view">
            <button type="button" onClick={() => setView("gallery")} aria-pressed={view === "gallery"} className={`rounded-sm px-3 py-1.5 text-sm ${view === "gallery" ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
              Gallery
            </button>
            <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={`rounded-sm px-3 py-1.5 text-sm ${view === "list" ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
              List
            </button>
          </div>
        </div>
      )}
      {!titles.length ? (
        <BuyerEmptyState />
      ) : tab === "licenses" ? (
        <TitleList titles={licensed} entitled={entitled} order={order} empty="No licenses yet. Discover a title and complete payment." />
      ) : view === "gallery" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted" aria-live="polite">Showing {pageTitles.length} of {visible.length} matching titles</p>
          <TitleGallery titles={pageTitles} artworkByTitle={artworkByTitle} entitled={entitled} order={order} />
          {visible.length > BUYER_GALLERY_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                className="rounded-sm border border-line px-3 py-2 text-sm disabled:opacity-40"
                disabled={currentPage === 0}
                onClick={() => setGalleryPage((page) => Math.max(0, page - 1))}
              >
                Previous
              </button>
              <span className="text-xs text-muted">Page {currentPage + 1} of {pageCount}</span>
              <button
                type="button"
                className="rounded-sm border border-line px-3 py-2 text-sm disabled:opacity-40"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setGalleryPage((page) => Math.min(pageCount - 1, page + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted" aria-live="polite">Showing {visible.length} matching titles</p>
          <TitleList titles={visible} entitled={entitled} order={order} empty="No titles match the current search and filters." />
        </div>
      )}
      {tab !== "licenses" && postersQ.isError && titles.length > 0 ? (
        <p role="status" className="text-xs text-muted">Poster artwork is temporarily unavailable. You can still open title details.</p>
      ) : null}
    </div>
  );
}

function formatLicensingFeePaise(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{note}</div>
    </div>
  );
}

type BuyerTitleCard = {
  id: string;
  name: string;
  synopsis: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  licensingFeePaise: number;
  status: string;
};

function BuyerEmptyState() {
  return (
    <section className="rounded-sm border border-dashed border-line bg-surface px-6 py-12 text-center sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Buyer catalogue</p>
      <h2 className="mt-3 font-display text-2xl font-semibold">No titles are live for licensing yet.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        The gallery is ready. Titles and approved poster artwork appear here only after the required
        QC, Legal, rights, packaging, curation and delivery checks pass and Bridge authorizes publication.
      </p>
    </section>
  );
}

function TitleGallery({
  titles,
  artworkByTitle,
  entitled,
  order,
}: {
  titles: BuyerTitleCard[];
  artworkByTitle: Map<string, Blob>;
  entitled: Set<string>;
  order: { isPending: boolean; mutate: (id: string) => void };
}) {
  if (!titles.length) return <p className="text-sm text-muted">No titles match this search.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {titles.map((title) => {
        const posterBlob = artworkByTitle.get(title.id);
        const details = [
          title.language,
          title.year ? String(title.year) : null,
          title.runtimeMinutes ? `${title.runtimeMinutes} min` : null,
        ].filter(Boolean).join(" · ");
        return (
          <article key={title.id} className="overflow-hidden rounded-sm border border-line bg-surface">
            <div className="relative aspect-[2/3] overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-slate-950">
              <BuyerPosterImage blob={posterBlob} title={title.name} />
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to="/title/$id" params={{ id: title.id }} className="font-semibold leading-snug hover:text-accent">
                    {title.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted">{details || "Details pending"}</p>
                </div>
                <StatusChip status={title.status as never} />
              </div>
              {title.synopsis.trim() ? (
                <p className="line-clamp-3 text-sm leading-relaxed text-muted">{title.synopsis}</p>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-sm font-medium">
                  {title.licensingFeePaise > 0
                    ? `${formatLicensingFeePaise(title.licensingFeePaise)} licensing fee`
                    : "Commercial terms on request"}
                </p>
                {entitled.has(title.id) ? (
                  <span className="shrink-0 text-sm font-semibold text-accent">Licensed</span>
                ) : (
                  <Button
                    disabled={order.isPending || title.licensingFeePaise <= 0}
                    onClick={() => order.mutate(title.id)}
                  >
                    License
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BuyerPosterImage({ blob, title }: { blob: Blob | undefined; title: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (url) {
    return (
      <img
        src={url}
        alt={`Poster artwork for ${title}`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Crayons Bridge</span>
      <p className="mt-4 line-clamp-4 font-display text-2xl font-semibold text-white">{title}</p>
      <p className="mt-4 text-xs text-white/60">Poster artwork unavailable</p>
    </div>
  );
}

function TitleList({ titles, entitled, order, empty }: { titles: BuyerTitleCard[]; entitled: Set<string>; order: { isPending: boolean; mutate: (id: string) => void }; empty: string }) {
  if (!titles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">{t.name}</Link>
            <p className="text-sm text-muted">{t.language}{t.licensingFeePaise > 0 ? ` · ${formatLicensingFeePaise(t.licensingFeePaise)}` : " · fee unset"}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusChip status={t.status as never} />
            {entitled.has(t.id) ? <span className="text-sm text-accent">Licensed</span> : <Button disabled={order.isPending || t.licensingFeePaise <= 0} onClick={() => order.mutate(t.id)}>License</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
