import { useState } from "react";
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
import {
  getBuyerComplianceStatus,
  submitBuyerOrganizationVerification,
  submitBuyerAcquisitionMandate,
  requestBuyerEvidenceUpload,
  confirmBuyerEvidenceUpload,
} from "@/lib/bridge/buyer-acquisition";

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
        <BridgeShell actor={actor} title="Buyer dashboard">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
            Discover licensing-ready titles, open a listing, then license only after captured payment.
          </p>
          <BuyerBody />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function BuyerBody() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"discover" | "listing" | "licenses">("discover");
  const [query, setQuery] = useState("");
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

  const titles = titlesQ.data?.titles ?? [];
  const needle = query.trim().toLowerCase();
  const visible = titles.filter((t) => !needle || `${t.name} ${t.language}`.toLowerCase().includes(needle));
  const licensed = visible.filter((t) => entitled.has(t.id));
  if (titlesQ.isPending || entQ.isPending) return <p>Loading buyer dashboard…</p>;
  if (titlesQ.isError)
    return (
      <p role="alert">
        No licensing-ready titles are on the desk yet.{" "}
        <button type="button" className="underline" onClick={() => void titlesQ.refetch()}>Refresh</button>
      </p>
    );

  return (
    <div className="space-y-5">
      <BuyerCompliance />
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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or language" className="w-full max-w-md rounded-sm border border-line bg-transparent px-3 py-2 text-sm" />
      )}
      {!titles.length ? (
        <p className="text-sm text-muted">No live titles yet. Nothing is for sale until licensing-ready clears.</p>
      ) : tab === "licenses" ? (
        <TitleList titles={licensed} entitled={entitled} order={order} empty="No licenses yet. Discover a title and complete payment." />
      ) : (
        <TitleList titles={visible} entitled={entitled} order={order} empty="No titles match this search." />
      )}
    </div>
  );
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

function TitleList({ titles, entitled, order, empty }: { titles: Array<{ id: string; name: string; language: string; licensingFeePaise: number; status: string }>; entitled: Set<string>; order: { isPending: boolean; mutate: (id: string) => void }; empty: string }) {
  if (!titles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {titles.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link to="/title/$id" params={{ id: t.id }} className="font-medium hover:text-accent">{t.name}</Link>
            <p className="text-sm text-muted">{t.language}{t.licensingFeePaise > 0 ? ` · ₹${(t.licensingFeePaise / 100).toFixed(0)}` : " · fee unset"}</p>
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


function BuyerCompliance() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["buyer-compliance-status"], queryFn: () => getBuyerComplianceStatus(), retry: false });
  const [buyerKind, setBuyerKind] = useState<"platform_buyer" | "buyer" | "distributor" | "aggregator">("platform_buyer");
  const [country, setCountry] = useState("India");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [accountId, setAccountId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [territories, setTerritories] = useState("IN");
  const [languages, setLanguages] = useState("Malayalam");
  const [mediaRights, setMediaRights] = useState("TVOD");
  const [models, setModels] = useState("DISTRIBUTION");
  const [exclusivity, setExclusivity] = useState<"exclusive" | "non_exclusive">("non_exclusive");
  const [sublicensing, setSublicensing] = useState(false);
  const [delegation, setDelegation] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [agreementReference, setAgreementReference] = useState("");
  const [organizationEvidenceKind, setOrganizationEvidenceKind] = useState<"company_registration" | "tax_registration" | "board_resolution" | "authorized_signatory">("company_registration");
  const [mandateEvidenceKind, setMandateEvidenceKind] = useState<"signed_agreement" | "channel_ownership" | "territory_schedule" | "rights_schedule">("signed_agreement");

  const orgMutation = useMutation({
    mutationFn: () => submitBuyerOrganizationVerification({ data: { buyerKind, legalRegistrationCountry: country, legalRegistrationNumber: registrationNumber, officialWebsite: website || undefined } }),
    onSuccess: () => { toast.success("Buyer organization submitted for legal review"); void qc.invalidateQueries({ queryKey: ["buyer-compliance-status"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Organization submission failed"),
  });
  const mandateMutation = useMutation({
    mutationFn: () => submitBuyerAcquisitionMandate({ data: {
      platformAccountId: accountId, platformChannelId: channelId,
      territoryCodes: territories.split(",").map((v) => v.trim()).filter(Boolean),
      languageCodes: languages.split(",").map((v) => v.trim()).filter(Boolean),
      mediaRights: mediaRights.split(",").map((v) => v.trim()).filter(Boolean),
      exploitationModels: models.split(",").map((v) => v.trim()).filter(Boolean),
      exclusivity, sublicensingAllowed: sublicensing, onwardDelegationAllowed: delegation,
      effectiveFrom: new Date(effectiveFrom).toISOString(), effectiveUntil: new Date(effectiveUntil).toISOString(),
      agreementReference,
    } }),
    onSuccess: () => { toast.success("YouTube acquisition mandate submitted"); void qc.invalidateQueries({ queryKey: ["buyer-compliance-status"] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Mandate submission failed"),
  });

  async function uploadEvidence(target: "organization" | "mandate", evidenceKind: string, file: File, mandateId?: string) {
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("Choose a non-empty PDF/JPEG/PNG file up to 20 MB");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Only PDF, JPEG and PNG legal evidence is accepted");
    const contentType = file.type as "application/pdf" | "image/jpeg" | "image/png";
    const signed = await requestBuyerEvidenceUpload({ data: { target, evidenceKind: evidenceKind as never, filename: file.name, contentType, mandateId } });
    const response = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": contentType }, body: file, redirect: "error" });
    if (!response.ok) throw new Error("Private evidence upload failed");
    await confirmBuyerEvidenceUpload({ data: { target, evidenceKind: evidenceKind as never, key: signed.objectKey, contentType, mandateId } });
    await qc.invalidateQueries({ queryKey: ["buyer-compliance-status"] });
    await qc.invalidateQueries({ queryKey: ["buyer-legal-compliance-queue"] });
    toast.success("Evidence uploaded and sealed for independent review");
  }

  if (status.isPending) return <section className="rounded-sm border border-line p-4"><p className="text-sm text-muted">Loading buyer legal status…</p></section>;
  if (status.isError) return <section className="rounded-sm border border-line p-4 space-y-2"><h2 className="font-semibold">Buyer legal onboarding</h2><p className="text-sm text-muted">An active Buyer organization and membership are required before legal onboarding. Ask an authorized Bridge administrator to create or link the organization; this screen will not create or modify shared organization records.</p></section>;
  const data = status.data;
  const verified = data.verification?.verification_status === "verified";
  return (
    <section className="rounded-sm border border-line p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display text-xl font-semibold">Buyer legal & acquisition mandate</h2><p className="text-xs text-muted">{data.organization.legalName}</p></div>
        <StatusChip status={(data.verification?.verification_status ?? "UNVERIFIED").toUpperCase() as never} />
      </div>
      {!verified ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Submit legal entity details, then upload the registration and authorized-signatory evidence. Licensing remains blocked until an independent reviewer approves it.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="rounded-sm border border-line bg-transparent p-2 text-sm" value={buyerKind} onChange={(e) => setBuyerKind(e.target.value as typeof buyerKind)}><option value="platform_buyer">Platform buyer</option><option value="buyer">Buyer</option><option value="distributor">Distributor</option><option value="aggregator">Aggregator</option></select>
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Registration country" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="Company registration number" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Official website (optional)" />
          </div>
          <Button disabled={orgMutation.isPending || registrationNumber.trim().length < 2 || country.trim().length < 2} onClick={() => orgMutation.mutate()}>Submit organization for review</Button>
          {data.verification ? <p className="text-xs text-muted">Status: {data.verification.verification_status} · {data.verification.review_notes ?? "Awaiting reviewer"}</p> : null}
          {data.verification ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded-sm border border-line bg-transparent p-2 text-sm" value={organizationEvidenceKind} onChange={(e) => setOrganizationEvidenceKind(e.target.value as typeof organizationEvidenceKind)}><option value="company_registration">Company registration</option><option value="tax_registration">Tax registration</option><option value="board_resolution">Board resolution</option><option value="authorized_signatory">Authorized signatory</option></select>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { const file=e.target.files?.[0]; if(file) void uploadEvidence("organization",organizationEvidenceKind,file).catch((error) => toast.error(error instanceof Error ? error.message : "Upload failed")); e.currentTarget.value=""; }} />
            </div>
          ) : null}
          <ul className="space-y-1 text-xs text-muted">{data.organizationEvidence.map((e) => <li key={e.id}>{e.evidence_kind} · {e.review_status}</li>)}</ul>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Organization verified. Submit a YouTube acquisition mandate and its signed agreement, channel ownership, territory and rights schedules.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="YouTube platform account ID" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="YouTube channel ID" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={territories} onChange={(e) => setTerritories(e.target.value)} placeholder="Territories, comma separated" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Languages, comma separated" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={mediaRights} onChange={(e) => setMediaRights(e.target.value)} placeholder="Media rights, comma separated" />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm" value={models} onChange={(e) => setModels(e.target.value)} placeholder="Exploitation models, comma separated" />
            <input type="datetime-local" className="rounded-sm border border-line bg-transparent p-2 text-sm" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <input type="datetime-local" className="rounded-sm border border-line bg-transparent p-2 text-sm" value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} />
            <input className="rounded-sm border border-line bg-transparent p-2 text-sm sm:col-span-2" value={agreementReference} onChange={(e) => setAgreementReference(e.target.value)} placeholder="Agreement reference" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={sublicensing} onChange={(e) => setSublicensing(e.target.checked)} />Sublicensing</label><label className="flex items-center gap-2"><input type="checkbox" checked={delegation} onChange={(e) => setDelegation(e.target.checked)} />Onward delegation</label><label className="flex items-center gap-2"><input type="checkbox" checked={exclusivity === "exclusive"} onChange={(e) => setExclusivity(e.target.checked ? "exclusive" : "non_exclusive")} />Exclusive mandate</label></div>
          <Button disabled={mandateMutation.isPending || !accountId.trim() || !channelId.trim() || !effectiveFrom || !effectiveUntil || !agreementReference.trim()} onClick={() => mandateMutation.mutate()}>Submit YouTube mandate</Button>
          {data.mandates.map((mandate) => (
            <div key={mandate.id} className="border-t border-line pt-3 space-y-2">
              <p className="text-sm font-medium">YouTube · {mandate.platform_channel_id} · {mandate.status}</p>
              <div className="flex flex-wrap items-center gap-2">
                <select className="rounded-sm border border-line bg-transparent p-2 text-sm" value={mandateEvidenceKind} onChange={(e) => setMandateEvidenceKind(e.target.value as typeof mandateEvidenceKind)}><option value="signed_agreement">Signed agreement</option><option value="channel_ownership">Channel ownership</option><option value="territory_schedule">Territory schedule</option><option value="rights_schedule">Rights schedule</option></select>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { const file=e.target.files?.[0]; if(file) void uploadEvidence("mandate",mandateEvidenceKind,file,mandate.id).catch((error) => toast.error(error instanceof Error ? error.message : "Upload failed")); e.currentTarget.value=""; }} />
              </div>
              {data.mandateEvidence.filter((e) => e.mandate_id === mandate.id).map((e) => <p key={e.id} className="text-xs text-muted">{e.evidence_kind} · {e.review_status}</p>)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
