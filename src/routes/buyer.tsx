import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, Film, Play, Search, Sparkles } from "lucide-react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { listTitleAssets, requestAssetDownload } from "@/lib/bridge/assets";
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
        <BridgeShell actor={actor} title="Buyer desk">
          <BuyerBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerBody() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "licenses">("discover");
  const [query, setQuery] = useState("");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles(), retry: 1 });
  const entQ = useQuery({
    queryKey: ["bridge-entitlements"],
    queryFn: () => listOwnEntitlements(),
    retry: 1,
  });
  const entitled = useMemo(
    () => new Set(entQ.data?.entitlements.map((entry) => entry.titleId) ?? []),
    [entQ.data?.entitlements],
  );
  const order = useMutation({
    mutationFn: async (titleId: string) => {
      const created = await createLicenseOrder({
        data: { titleId, idempotencyKey: `lic-${titleId}-${Date.now()}` },
      });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const checkout = new Razorpay({
          key: created.keyId,
          amount: created.amountPaise,
          currency: created.currency,
          order_id: created.orderId,
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
        checkout.open();
      });
    },
    onSuccess: () => {
      toast("Payment captured — licence entitlement recorded");
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-entitlements"] });
      setTab("licenses");
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Payment did not complete"),
  });

  const titles = titlesQ.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const matching = titles.filter((title) =>
    !needle || `${title.name} ${title.language} ${title.contentType}`.toLowerCase().includes(needle),
  );
  const visible = tab === "licenses" ? matching.filter((title) => entitled.has(title.id)) : matching;
  const licensedCount = titles.filter((title) => entitled.has(title.id)).length;

  if (titlesQ.isPending || entQ.isPending) {
    return (
      <div className="grid min-h-[48vh] place-items-center rounded-3xl border border-white/10 bg-[#10151d] text-sm text-white/55">
        Preparing your acquisition room…
      </div>
    );
  }
  if (titlesQ.isError || entQ.isError) {
    return (
      <div className="rounded-3xl border border-amber-300/20 bg-amber-300/5 p-6 text-sm text-amber-100">
        The buyer catalogue could not be loaded. No availability or licensing status is being assumed.{" "}
        <button
          type="button"
          className="ml-2 font-semibold underline underline-offset-4"
          onClick={() => {
            void titlesQ.refetch();
            void entQ.refetch();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const featured = tab === "discover" ? visible[0] : undefined;
  const remaining = featured ? visible.slice(1) : visible;

  return (
    <div className="-mx-4 -mt-2 space-y-8 rounded-t-[2rem] bg-[#080b10] px-4 pb-10 pt-6 text-white sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(ellipse_at_78%_10%,rgba(29,106,126,0.34),transparent_42%),linear-gradient(135deg,#17232c_0%,#10151d_48%,#090c12_100%)]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 p-6 sm:p-9 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
              <Sparkles size={13} /> Curated acquisition
            </div>
            <h2 className="font-display text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Stories worth<br className="hidden sm:block" /> bringing to screen.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/55">
              Discover approved titles. Review the artwork. Explore the rights. Move when it fits.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[270px]">
            <Metric label="In your catalogue" value={String(titles.length)} />
            <Metric label="Your licences" value={String(licensedCount)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/15 px-6 py-3.5 text-[11px] text-white/45 sm:px-9">
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Rights-gated catalogue</span>
          <span>Bridge authorizes · Loop delivers</span>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/65">The collection</p>
            <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {tab === "licenses" ? "Your licensed titles" : "Find your next title"}
            </h3>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setTab("discover")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${tab === "discover" ? "bg-white text-[#10151d]" : "text-white/55 hover:text-white"}`}
              >
                Discover
              </button>
              <button
                type="button"
                onClick={() => setTab("licenses")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${tab === "licenses" ? "bg-white text-[#10151d]" : "text-white/55 hover:text-white"}`}
              >
                My licences
              </button>
            </div>
            <label className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 sm:w-64">
              <Search size={14} className="shrink-0 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles"
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
              />
            </label>
          </div>
        </div>

        {featured ? (
          <FeaturedTitle
            title={featured}
            entitled={entitled.has(featured.id)}
            pending={order.isPending}
            onLicense={() => order.mutate(featured.id)}
          />
        ) : null}

        {remaining.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {remaining.map((title) => (
              <TitleCard
                key={title.id}
                title={title}
                entitled={entitled.has(title.id)}
                pending={order.isPending}
                onLicense={() => order.mutate(title.id)}
              />
            ))}
          </div>
        ) : !featured ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] px-6 py-14 text-center">
            <Film className="mx-auto mb-4 text-white/30" size={30} />
            <p className="font-display text-xl font-semibold">
              {tab === "licenses" ? "Your first title is waiting." : "No titles in this view yet."}
            </p>
            <p className="mt-2 text-sm text-white/45">
              {tab === "licenses"
                ? "Licensed titles will appear here after payment is captured."
                : "Only titles cleared for buyer visibility appear in this catalogue."}
            </p>
            {tab === "licenses" ? (
              <button type="button" onClick={() => setTab("discover")} className="mt-5 text-xs font-semibold text-cyan-200 hover:text-white">
                Browse catalogue <ArrowUpRight className="ml-1 inline" size={13} />
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[10px] uppercase tracking-[0.16em] text-white/30">
        <span>Crayons Bridge · Buyer workspace</span>
        <span>Private media · Verified rights · Secure licensing</span>
      </div>
    </div>
  );
}

type BuyerTitle = {
  id: string;
  name: string;
  language: string;
  year: number | null;
  runtimeMinutes: number | null;
  contentType: string;
  licensingFeePaise: number;
  status: string;
};

function useBuyerArtwork(titleId: string, entitled: boolean) {
  const assetsQ = useQuery({
    queryKey: ["buyer-title-assets", titleId],
    queryFn: () => listTitleAssets({ data: { titleId } }),
    retry: false,
  });
  const poster = assetsQ.data?.assets.find((asset) =>
    ["poster_vertical", "poster", "poster_horizontal", "thumbnail"].includes(asset.kind),
  );
  const screener = assetsQ.data?.assets.find((asset) => asset.kind === "screener");
  const posterQ = useQuery({
    queryKey: ["buyer-poster-url", poster?.id],
    queryFn: () => requestAssetDownload({ data: { assetId: poster!.id } }),
    enabled: Boolean(poster?.id),
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
  const screenerQ = useQuery({
    queryKey: ["buyer-screener-url", screener?.id],
    queryFn: () => requestAssetDownload({ data: { assetId: screener!.id } }),
    enabled: Boolean(entitled && screener?.id),
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
  return {
    posterUrl: posterQ.data?.url,
    screenerUrl: screenerQ.data?.url,
    hasScreener: Boolean(screener?.id),
  };
}

function FeaturedTitle({
  title,
  entitled,
  pending,
  onLicense,
}: {
  title: BuyerTitle;
  entitled: boolean;
  pending: boolean;
  onLicense: () => void;
}) {
  const media = useBuyerArtwork(title.id, entitled);
  return (
    <article className="group relative isolate grid min-h-[390px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#121923] lg:grid-cols-[1.15fr_0.85fr]">
      <div className="absolute inset-0 -z-10 lg:inset-y-0 lg:left-0 lg:w-[62%]">
        {media.posterUrl ? (
          <img src={media.posterUrl} alt="" className="h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-[1.025]" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_30%_25%,rgba(28,135,153,0.45),transparent_42%),linear-gradient(135deg,#273d49,#111923_65%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0f16]/95 via-[#0a0f16]/75 to-[#0a0f16]/20 lg:bg-gradient-to-r lg:from-[#0a0f16]/95 lg:via-[#0a0f16]/65 lg:to-transparent" />
      </div>
      <div className="relative flex flex-col justify-end p-6 sm:p-9 lg:col-span-2 lg:max-w-[62%]">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100/75">Featured selection</span>
        <h4 className="max-w-xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title.name}</h4>
        <p className="mt-3 text-xs text-white/60">
          {[title.language, title.year, title.runtimeMinutes ? `${title.runtimeMinutes} min` : null, title.contentType]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {entitled && media.screenerUrl ? (
            <a href={media.screenerUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-xs font-semibold text-[#10151d] transition hover:bg-cyan-100">
              <Play size={14} fill="currentColor" /> Open screener
            </a>
          ) : (
            <Button disabled={pending || title.licensingFeePaise <= 0 || entitled} onClick={onLicense} className="h-10 rounded-full bg-cyan-200 px-5 text-xs font-semibold text-[#0b1820] hover:bg-white">
              {entitled ? "Licensed" : "License title"}
            </Button>
          )}
          <Link to="/title/$id" params={{ id: title.id }} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-xs font-semibold text-white/80 transition hover:border-white/50 hover:text-white">
            View details <ArrowUpRight size={14} />
          </Link>
        </div>
        {media.hasScreener && !entitled ? (
          <p className="mt-3 text-[10px] text-white/40">Private video screener unlocks with an active licence entitlement.</p>
        ) : null}
      </div>
      <div className="relative hidden items-end justify-end p-7 lg:flex">
        <div className="rounded-2xl border border-white/15 bg-black/30 p-4 backdrop-blur-xl">
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/45">Licence value</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {title.licensingFeePaise > 0 ? `₹${(title.licensingFeePaise / 100).toLocaleString("en-IN")}` : "On request"}
          </p>
        </div>
      </div>
    </article>
  );
}

function TitleCard({
  title,
  entitled,
  pending,
  onLicense,
}: {
  title: BuyerTitle;
  entitled: boolean;
  pending: boolean;
  onLicense: () => void;
}) {
  const media = useBuyerArtwork(title.id, entitled);
  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111720] transition duration-300 hover:-translate-y-1 hover:border-cyan-100/30 hover:bg-[#151f2a]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(ellipse_at_25%_20%,rgba(36,122,139,0.4),transparent_42%),linear-gradient(135deg,#263b46,#101720)]">
        {media.posterUrl ? (
          <img src={media.posterUrl} alt={`${title.name} poster`} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <Film size={34} className="text-white/25" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080b10]/90 via-transparent to-black/10" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75 backdrop-blur">{title.contentType}</span>
          {entitled ? <span className="rounded-full bg-emerald-300 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#10221a]">Licensed</span> : null}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate font-display text-lg font-semibold tracking-tight">{title.name}</h4>
            <p className="mt-1 text-[11px] text-white/45">
              {[title.language, title.year, title.runtimeMinutes ? `${title.runtimeMinutes} min` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <StatusChip status={title.status as never} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-sm font-semibold">
            {title.licensingFeePaise > 0 ? `₹${(title.licensingFeePaise / 100).toLocaleString("en-IN")}` : "On request"}
          </span>
          <div className="flex items-center gap-2">
            <Link to="/title/$id" params={{ id: title.id }} className="inline-flex h-8 items-center gap-1 text-[11px] font-semibold text-white/55 hover:text-white">
              Details <ArrowUpRight size={12} />
            </Link>
            {!entitled ? (
              <Button size="sm" disabled={pending || title.licensingFeePaise <= 0} onClick={onLicense} className="h-8 rounded-full bg-cyan-200 px-3 text-[10px] font-bold text-[#0b1820] hover:bg-white">
                License
              </Button>
            ) : media.screenerUrl ? (
              <a href={media.screenerUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-white/20 px-3 text-[10px] font-semibold text-white hover:border-cyan-100/50">
                <Play size={11} fill="currentColor" /> Screener
              </a>
            ) : null}
          </div>
        </div>
        {media.hasScreener && !entitled ? (
          <p className="mt-2 text-[9px] text-white/35">Private screener · licence required</p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4 backdrop-blur">
      <p className="text-[9px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
