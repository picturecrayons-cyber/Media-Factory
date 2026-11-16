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
  const visible = titles.filter((t) => !needle || `${t.name} ${t.language}`.toLowerCase().includes(needle));
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
    <div className="space-y-8 pb-10">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-cyan-300/15 bg-[#08131f] px-6 py-8 text-white shadow-[0_24px_80px_-36px_rgba(6,182,212,0.45)] sm:px-9 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200">Crayons Bridge · Private licensing marketplace</p>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-5xl">Stories worth bringing to your audience.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base">Discover curated film and series opportunities, review approved listing details, and manage captured licenses in one secure workspace.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#buyer-catalogue" className="inline-flex items-center rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-[#07131e] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200">Explore catalogue <span className="ml-2" aria-hidden="true">↘</span></a>
            <span className="text-xs text-white/55">Only Bridge-authorized listings are shown</span>
          </div>
        </div>
        <div className="relative mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:mt-10">
          <HeroStat value={String(titles.length)} label="Live listings" />
          <HeroStat value={String(visible.length)} label="Search matches" />
          <HeroStat value={String(licensed.length)} label="Your licenses" />
        </div>
      </section>
      <div id="buyer-catalogue" className="scroll-mt-6 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Discover" value={String(titles.length)} note="Live for buyers" />
        <Stat label="Listing" value={String(visible.length)} note="Matching this search" />
        <Stat label="Licenses" value={String(licensed.length)} note="Captured entitlements" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["discover", "listing", "licenses"] as const).map((id) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full border px-4 py-2 text-sm capitalize transition ${tab === id ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-200 shadow-sm" : "border-line text-muted hover:border-accent/50 hover:text-fg"}`}>
            {id}
          </button>
        ))}
      </div>
      {tab !== "licenses" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-sm focus-within:border-accent/60"><span aria-hidden="true" className="text-lg text-muted">⌕</span><span className="sr-only">Search title or language</span><input value={query} onChange={(e) => { setQuery(e.target.value); setGalleryPage(0); }} placeholder="Search titles, languages…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" /></label>
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
        <TitleList titles={visible} entitled={entitled} order={order} empty="No titles match this search." />
      )}
      </div>
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

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-100/60 sm:text-xs">{label}</div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line/80 bg-panel/70 px-5 py-4 shadow-sm transition hover:border-accent/40">
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
    <section className="rounded-3xl border border-dashed border-cyan-300/25 bg-gradient-to-br from-cyan-400/[0.06] via-surface to-blue-500/[0.05] px-6 py-14 text-center shadow-inner sm:px-10">
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
          <article key={title.id} className="group overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl">
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
