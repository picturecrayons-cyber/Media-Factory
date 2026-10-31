import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { StatusChip } from "@/components/bridge/status-rail";
import { Button } from "@/components/ui/button";
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
}) => { open: () => void };

type BuyerTitle = {
  id: string;
  name: string;
  synopsis?: string;
  language: string;
  year: number | null;
  runtimeMinutes?: number | null;
  contentType?: string;
  licensingFeePaise: number;
  status: string;
};

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
        <BridgeShell actor={actor} title="Buyer discovery">
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
  const [language, setLanguage] = useState("All languages");
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const entQ = useQuery({
    queryKey: ["bridge-entitlements"],
    queryFn: () => listOwnEntitlements(),
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
      void qc.invalidateQueries({ queryKey: ["bridge-titles"] });
      void qc.invalidateQueries({ queryKey: ["bridge-entitlements"] });
      setTab("licenses");
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Payment did not complete"),
  });

  const titles = (titlesQ.data?.titles ?? []) as BuyerTitle[];
  const languages = useMemo(
    () => ["All languages", ...Array.from(new Set(titles.map((t) => t.language).filter(Boolean))).sort()],
    [titles],
  );
  const needle = query.trim().toLowerCase();
  const matching = titles.filter((t) => {
    const haystack = `${t.name} ${t.synopsis ?? ""} ${t.language} ${t.contentType ?? ""} ${t.year ?? ""}`.toLowerCase();
    return (!needle || haystack.includes(needle)) && (language === "All languages" || t.language === language);
  });
  const licensed = matching.filter((t) => entitled.has(t.id));
  const shown = tab === "licenses" ? licensed : matching;

  if (titlesQ.isPending || entQ.isPending) {
    return <div className="rounded-2xl border border-line p-8 text-sm text-muted">Preparing your buyer catalogue…</div>;
  }
  if (titlesQ.isError || entQ.isError) {
    return (
      <div role="alert" className="rounded-2xl border border-line p-6">
        <p className="font-medium">The buyer catalogue could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">Refresh the catalogue and try again. No payment has been initiated.</p>
        <button type="button" className="mt-4 text-sm font-semibold underline" onClick={() => { void titlesQ.refetch(); void entQ.refetch(); }}>Refresh catalogue</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-line bg-[#111923] px-6 py-8 text-white sm:px-9 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">Crayons Bridge · Private marketplace</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Stories worth bringing to your audience.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base">Explore a curated catalogue of rights-cleared titles. Review each listing, confirm the commercial terms, and license securely when you are ready.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#buyer-catalogue" className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#111923] transition hover:bg-amber-100">Explore catalogue <span className="ml-2" aria-hidden="true">↘</span></a>
            <span className="text-xs text-white/55">Only approved, buyer-visible listings appear here</span>
          </div>
        </div>
        <div className="relative mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/15 pt-5 sm:mt-10">
          <HeroStat value={String(titles.length)} label="Available titles" />
          <HeroStat value={String(entitled.size)} label="Your licenses" />
          <HeroStat value={String(new Set(titles.map((t) => t.language)).size)} label="Languages" />
        </div>
      </section>

      <section id="buyer-catalogue" className="scroll-mt-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">The marketplace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Discover titles</h2>
            <p className="mt-1 text-sm text-muted">A focused catalogue for acquisition and licensing teams.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-line px-3 py-1.5 text-muted">{titles.length} live listings</span>
            <span className="rounded-full border border-line px-3 py-1.5 text-muted">{licensed.length} licensed by you</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-3 px-2">
            <span aria-hidden="true" className="text-lg text-muted">⌕</span>
            <span className="sr-only">Search catalogue</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title, story, language or year…" className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted" />
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <label htmlFor="buyer-language" className="sr-only">Filter by language</label>
            <select id="buyer-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="min-w-36 rounded-full border border-line bg-transparent px-3 py-2 text-xs">
              {languages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="flex rounded-full bg-subtle p-1">
              {(["discover", "licenses"] as const).map((id) => (
                <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-full px-3 py-2 text-xs font-medium capitalize transition ${tab === id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
                  {id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {shown.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((title, index) => (
              <BuyerTitleCard key={title.id} title={title} entitled={entitled.has(title.id)} pending={order.isPending} onLicense={() => order.mutate(title.id)} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-panel px-6 py-14 text-center">
            <div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-subtle text-2xl">✦</div>
            <h3 className="mt-4 text-lg font-semibold">{tab === "licenses" ? "Your licensed titles will appear here" : "The next great title is on its way"}</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{tab === "licenses" ? "Once a payment is captured and the entitlement is verified, your license will be listed here." : titles.length ? "No listings match those filters. Try another title or language." : "There are no live buyer listings at the moment. Titles appear here only after Bridge's rights, QC, legal and publication gates clear."}</p>
            {(query || language !== "All languages") && <button type="button" onClick={() => { setQuery(""); setLanguage("All languages"); }} className="mt-4 text-sm font-semibold underline">Clear filters</button>}
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-muted">Licensing is completed only after payment capture and server-side verification. A listing or preview does not itself grant distribution rights.</p>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/55 sm:text-xs">{label}</div>
    </div>
  );
}

function BuyerTitleCard({ title, entitled, pending, onLicense, index }: { title: BuyerTitle; entitled: boolean; pending: boolean; onLicense: () => void; index: number }) {
  const palettes = [
    "from-[#23364a] via-[#34566a] to-[#17232f]",
    "from-[#594438] via-[#8a6547] to-[#29211f]",
    "from-[#353c55] via-[#665c80] to-[#22263b]",
    "from-[#254a45] via-[#42796a] to-[#1b302e]",
  ];
  const initials = title.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const fee = title.licensingFeePaise > 0
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(title.licensingFeePaise / 100)
    : "Terms on request";
  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-panel transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`relative flex h-48 items-end overflow-hidden bg-gradient-to-br ${palettes[index % palettes.length]} p-5 text-white`}>
        <div aria-hidden="true" className="absolute -right-8 -top-12 h-48 w-48 rounded-full border border-white/15" />
        <div aria-hidden="true" className="absolute -right-1 top-2 h-32 w-32 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="relative flex w-full items-end justify-between gap-3">
          <div className="max-w-[75%]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-white/65">{title.contentType || "Feature title"}</p>
            <p className="mt-2 text-3xl font-semibold tracking-[0.08em] text-white/90">{initials}</p>
          </div>
          <div className="rounded-full border border-white/25 bg-black/15 px-3 py-1 text-[10px] text-white/85">{title.year ?? "New"}</div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight">{title.name}</h3>
            <p className="mt-1 text-xs text-muted">{title.language}{title.runtimeMinutes ? ` · ${title.runtimeMinutes} min` : ""}</p>
          </div>
          {entitled ? <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-[10px] font-semibold">Licensed</span> : <StatusChip status={title.status as never} />}
        </div>
        {title.synopsis ? <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted">{title.synopsis}</p> : <p className="min-h-[3.75rem] text-sm text-muted">Open the title record to review available listing details.</p>}
        <div className="flex items-end justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">Licensing fee</p>
            <p className="mt-1 text-base font-semibold">{fee}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/title/$id" params={{ id: title.id }} className="rounded-full border border-line px-3 py-2 text-xs font-semibold transition hover:bg-subtle">Details</Link>
            {entitled ? <span className="px-2 text-xs font-semibold text-muted">Access granted</span> : <Button size="sm" disabled={pending || title.licensingFeePaise <= 0} onClick={onLicense}>License</Button>}
          </div>
        </div>
      </div>
    </article>
  );
}
