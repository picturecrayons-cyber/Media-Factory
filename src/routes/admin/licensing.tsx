import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import { listAdminProfiles } from "@/lib/bridge/profiles";
import { createAcceptedLicenseDeal } from "@/lib/bridge/payments";

export const Route = createFileRoute("/admin/licensing")({ component: AdminLicensing });

function AdminLicensing() {
  return (
    <RequireBridge allow="internal">
      {(actor) => {
        if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
          return <BridgeShell actor={actor} title="Licensing deals"><p role="alert" className="rounded-xl border border-line p-6">Administrator access is required to record an accepted deal.</p></BridgeShell>;
        }
        return <BridgeShell actor={actor} title="Licensing deals"><DealForm /></BridgeShell>;
      }}
    </RequireBridge>
  );
}

function DealForm() {
  const qc = useQueryClient();
  const titlesQ = useQuery({ queryKey: ["bridge-titles"], queryFn: () => listTitles() });
  const profilesQ = useQuery({ queryKey: ["bridge-admin-profiles"], queryFn: () => listAdminProfiles() });
  const [titleId, setTitleId] = useState("");
  const [buyerUserId, setBuyerUserId] = useState("");
  const [rightsCategory, setRightsCategory] = useState("SVOD");
  const [territories, setTerritories] = useState("IN");
  const [languages, setLanguages] = useState("Malayalam");
  const [mediaModes, setMediaModes] = useState("SVOD");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [feeRupees, setFeeRupees] = useState("");
  const [contractReference, setContractReference] = useState("");

  const createDeal = useMutation({
    mutationFn: createAcceptedLicenseDeal,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bridge-accepted-license-deals"] });
      setTitleId("");
      setBuyerUserId("");
      setFeeRupees("");
      setContractReference("");
    },
  });

  const titles = (titlesQ.data?.titles ?? []).filter((title) =>
    ["LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED"].includes(title.status)
  );
  const buyers = (profilesQ.data?.profiles ?? []).filter((profile) => profile.accountType === "buyer");

  function splitValues(value: string) {
    return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
  }

  function submit() {
    const agreedFeePaise = Math.round(Number(feeRupees) * 100);
    if (!Number.isFinite(agreedFeePaise) || agreedFeePaise <= 0) return;
    createDeal.mutate({
      data: {
        titleId,
        buyerUserId,
        rightsCategory: rightsCategory.trim(),
        territories: splitValues(territories),
        languages: splitValues(languages),
        mediaModes: splitValues(mediaModes),
        termStart,
        termEnd,
        exclusivity,
        agreedFeePaise,
        contractReference: contractReference.trim(),
        termsSnapshot: {
          rightsCategory: rightsCategory.trim(),
          territories: splitValues(territories),
          languages: splitValues(languages),
          mediaModes: splitValues(mediaModes),
          termStart,
          termEnd,
          exclusivity,
          agreedFeePaise,
          currency: "INR",
        },
      },
    });
  }

  if (titlesQ.isPending || profilesQ.isPending) return <p className="p-6 text-sm text-muted">Loading titles and buyer accounts…</p>;
  if (titlesQ.isError || profilesQ.isError) return <p role="alert" className="p-6 text-sm">Could not load the canonical title and buyer lists. No deal was created.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <Link to="/admin" className="text-sm text-accent hover:underline">← Admin overview</Link>
        <h2 className="mt-3 font-display text-3xl font-semibold">Record an accepted licensing deal</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Internal admin only. Record this after commercial approval and an executed contract. The agreed fee and scoped terms become the source for buyer checkout; a payment alone never authorizes Loop publication.
        </p>
      </section>

      <form className="grid gap-4 rounded-3xl border border-line bg-surface p-6 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label className="grid gap-1 text-sm">
          Canonical title
          <select required value={titleId} onChange={(event) => setTitleId(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2">
            <option value="">Select title</option>
            {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Buyer account
          <select required value={buyerUserId} onChange={(event) => setBuyerUserId(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2">
            <option value="">Select buyer</option>
            {buyers.map((buyer) => <option key={buyer.userId} value={buyer.userId}>{buyer.displayName || buyer.email} · {buyer.email}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Rights category
          <select required value={rightsCategory} onChange={(event) => setRightsCategory(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2">
            {["THEATRICAL_FIRST_RUN","TV_FREE_TO_AIR","TV_PAY_TV","SVOD","TVOD_RENTAL","EST_DIGITAL_PURCHASE","AVOD","BVOD","FAST","PPV","AIRLINE","HOTEL","EDUCATIONAL","FESTIVAL","PROMOTIONAL_CLIPS","SOUNDTRACK_AUDIO","REMAKE","SEQUEL_PREQUEL","SPIN_OFF","GAME","MERCHANDISING","REMASTER_RESTORATION","DUBBING","SUBTITLING","ACCESSIBILITY","TERRITORY_EDIT","ARCHIVE"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Agreed fee (INR)
          <input required inputMode="decimal" type="number" min="0.01" step="0.01" value={feeRupees} onChange={(event) => setFeeRupees(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Territories (comma-separated codes)
          <input required value={territories} onChange={(event) => setTerritories(event.target.value)} placeholder="IN, AE, GB" className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Languages
          <input required value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="Malayalam, English subtitles" className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Media / exploitation modes
          <input required value={mediaModes} onChange={(event) => setMediaModes(event.target.value)} placeholder="SVOD, TVOD" className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Exclusivity
          <select value={exclusivity} onChange={(event) => setExclusivity(event.target.value as "EXCLUSIVE" | "NON_EXCLUSIVE")} className="rounded-md border border-line bg-bg px-3 py-2">
            <option value="NON_EXCLUSIVE">Non-exclusive</option>
            <option value="EXCLUSIVE">Exclusive</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          License starts
          <input required type="date" value={termStart} onChange={(event) => setTermStart(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          License ends
          <input required type="date" min={termStart || undefined} value={termEnd} onChange={(event) => setTermEnd(event.target.value)} className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          Executed contract reference (internal reference only)
          <input required minLength={3} maxLength={500} value={contractReference} onChange={(event) => setContractReference(event.target.value)} placeholder="Contract repository reference or signed agreement ID" className="rounded-md border border-line bg-bg px-3 py-2" />
        </label>
        <div className="sm:col-span-2 rounded-md border border-line p-3 text-sm text-muted">
          The contract reference and full terms snapshot are never returned to buyer discovery. This action records the admin attestation that the contract is executed.
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={createDeal.isPending || !titleId || !buyerUserId || !termStart || !termEnd || !contractReference.trim() || !feeRupees}>
            {createDeal.isPending ? "Recording deal…" : "Record accepted deal"}
          </Button>
          {createDeal.isSuccess ? <p role="status" className="text-sm">Accepted deal recorded. It is available to the selected buyer during its valid term.</p> : null}
          {createDeal.isError ? <p role="alert" className="text-sm text-accent">{createDeal.error instanceof Error ? createDeal.error.message : "Could not record deal."}</p> : null}
        </div>
      </form>
    </div>
  );
}
