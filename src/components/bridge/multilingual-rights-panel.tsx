import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createLanguageRight, createLicensePackage, listLanguageRights, listLicensePackages } from "@/lib/bridge/multilingual-rights";
import { createLicenseOrder, verifyLicensePayment } from "@/lib/bridge/payments";
import { hasPermission } from "@/lib/bridge/rbac";
import type { BridgeActor } from "@/lib/bridge/session";

type Props = { titleId: string; actor: BridgeActor };

function csv(value: string) {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function loadRazorpay(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.Razorpay) return resolve(w.Razorpay);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay checkout missing"));
    s.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.head.appendChild(s);
  });
}

export function MultilingualRightsPanel({ titleId, actor }: Props) {
  const qc = useQueryClient();
  const rightsQ = useQuery({ queryKey: ["bridge-language-rights", titleId], queryFn: () => listLanguageRights({ data: { titleId } }) });
  const packagesQ = useQuery({ queryKey: ["bridge-language-packages", titleId], queryFn: () => listLicensePackages({ data: { titleId } }) });
  const rights = rightsQ.data?.rights ?? [];
  const packages = packagesQ.data?.packages ?? [];
  const canManage = hasPermission(actor, "title.rights_review") && Boolean(actor.internalRole);
  const canPackage = hasPermission(actor, "title.license") && Boolean(actor.internalRole);

  const [language, setLanguage] = useState("");
  const [rightType, setRightType] = useState<"DUBBING" | "SUBTITLING">("DUBBING");
  const [territories, setTerritories] = useState("India");
  const [media, setMedia] = useState("OTT");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [askingPrice, setAskingPrice] = useState("");
  const [evidence, setEvidence] = useState("");

  const [packageName, setPackageName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [packageTerritories, setPackageTerritories] = useState("India");
  const [packageMedia, setPackageMedia] = useState("OTT");
  const [packageStart, setPackageStart] = useState("");
  const [packageEnd, setPackageEnd] = useState("");
  const [packageExclusivity, setPackageExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [packagePrice, setPackagePrice] = useState("");

  const addRight = useMutation({
    mutationFn: () => createLanguageRight({
      data: {
        titleId, language, rightType, territories: csv(territories), media: csv(media),
        windowStart: toIso(start), windowEnd: toIso(end), exclusivity,
        askingPricePaise: Math.round(Number(askingPrice || 0) * 100),
        evidence: csv(evidence),
      },
    }),
    onSuccess: () => { toast("Language right added"); setLanguage(""); setEvidence(""); void qc.invalidateQueries({ queryKey: ["bridge-language-rights", titleId] }); },
    onError: (e) => toast(e instanceof Error ? e.message : "Could not add language right"),
  });

  const addPackage = useMutation({
    mutationFn: () => createLicensePackage({
      data: {
        titleId, name: packageName, languageRightIds: selected,
        territories: csv(packageTerritories), media: csv(packageMedia),
        windowStart: toIso(packageStart), windowEnd: toIso(packageEnd),
        exclusivity: packageExclusivity, pricePaise: Math.round(Number(packagePrice || 0) * 100),
        assetVersionIds: [],
      },
    }),
    onSuccess: () => { toast("Language package ready for buyers"); setPackageName(""); setSelected([]); void qc.invalidateQueries({ queryKey: ["bridge-language-packages", titleId] }); },
    onError: (e) => toast(e instanceof Error ? e.message : "Could not create package"),
  });

  async function buyPackage(packageId: string) {
    try {
      const created = await createLicenseOrder({ data: { titleId, packageId, idempotencyKey: "pkg-" + packageId } });
      const Razorpay = await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const checkout = new Razorpay({
          key: created.keyId, amount: created.amountPaise, currency: created.currency, order_id: created.orderId,
          handler: (res: any) => void verifyLicensePayment({ data: {
            orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature,
          }}).then(() => resolve()).catch(reject),
        });
        checkout.open();
      });
      toast("Package payment captured");
      void qc.invalidateQueries({ queryKey: ["bridge-language-packages", titleId] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Package payment did not complete");
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Multilingual rights</p>
        <h2 className="mt-1 font-display text-xl font-semibold">Language Rights & Packages</h2>
        <p className="mt-2 text-sm text-muted">Language, territory, media and window are explicit rights. Dubbing assets do not create rights by themselves.</p>
      </div>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); addRight.mutate(); }} className="space-y-3 rounded-xl border border-line p-4">
            <h3 className="font-semibold">Add language right</h3>
            <input required value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Language e.g. Hindi" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={rightType} onChange={(e) => setRightType(e.target.value as typeof rightType)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm"><option value="DUBBING">Dubbing</option><option value="SUBTITLING">Subtitling</option></select>
              <select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as typeof exclusivity)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select>
            </div>
            <input required value={territories} onChange={(e) => setTerritories(e.target.value)} placeholder="Territories: India, GCC" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
            <input required value={media} onChange={(e) => setMedia(e.target.value)} placeholder="Media: OTT, SVOD" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
            <div className="grid grid-cols-2 gap-2"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2"><input required inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="Asking price ₹" className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /><input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence refs (comma-separated)" className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /></div>
            <Button type="submit" disabled={addRight.isPending}>{addRight.isPending ? "Saving…" : "Add right"}</Button>
          </form>

          {canPackage ? (
            <form onSubmit={(e) => { e.preventDefault(); addPackage.mutate(); }} className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="font-semibold">Build buyer package</h3>
              <input required value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="Package name e.g. Hindi + Tamil OTT" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
              <div className="space-y-2">
                {rights.filter((r) => r.status === "VALID").map((r) => (
                  <label key={r.id} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => setSelected((v) => e.target.checked ? [...v, r.id] : v.filter((id) => id !== r.id))} />
                    <span>{r.language} · {r.rightType} · {r.exclusivity}</span>
                  </label>
                ))}
              </div>
              <input required value={packageTerritories} onChange={(e) => setPackageTerritories(e.target.value)} placeholder="Territories" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
              <input required value={packageMedia} onChange={(e) => setPackageMedia(e.target.value)} placeholder="Media" className="h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-sm" />
              <div className="grid grid-cols-2 gap-2"><input type="datetime-local" value={packageStart} onChange={(e) => setPackageStart(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /><input type="datetime-local" value={packageEnd} onChange={(e) => setPackageEnd(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2"><select value={packageExclusivity} onChange={(e) => setPackageExclusivity(e.target.value as typeof packageExclusivity)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select><input required inputMode="decimal" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} placeholder="Package price ₹" className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-sm" /></div>
              <Button type="submit" disabled={addPackage.isPending || selected.length === 0}>{addPackage.isPending ? "Building…" : "Publish package to buyers"}</Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {rights.length ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wider text-muted"><tr><th className="px-3 py-3">Language</th><th className="px-3 py-3">Right</th><th className="px-3 py-3">Territory</th><th className="px-3 py-3">Window</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{rights.map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="px-3 py-3 font-medium">{r.language}</td><td className="px-3 py-3">{r.rightType}</td><td className="px-3 py-3">{r.territories.join(", ")}</td><td className="px-3 py-3">{r.windowStart ? new Date(r.windowStart).toLocaleDateString() : "Open"} – {r.windowEnd ? new Date(r.windowEnd).toLocaleDateString() : "Open"}</td><td className="px-3 py-3">{r.status}</td></tr>)}</tbody></table>
        </div>
      ) : <p className="text-sm text-muted">No language rights recorded yet.</p>}

      {packages.length ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Buyer packages</h3>
          {packages.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"><div><p className="font-medium">{p.name}</p><p className="text-sm text-muted">{p.territories.join(", ")} · {p.media.join(", ")} · {p.exclusivity}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold">₹{(p.pricePaise / 100).toLocaleString("en-IN")}</span>{actor.accountType === "buyer" && p.status === "READY" ? <Button type="button" onClick={() => void buyPackage(p.id)}>License package</Button> : <span className="text-xs text-muted">{p.status} · delivery {p.deliveryStatus}</span>}</div></div>)}
        </div>
      ) : null}
    </section>
  );
}
