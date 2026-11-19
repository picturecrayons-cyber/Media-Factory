import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  createOwnershipClaim,
  listMyOwnershipClaims,
  requestOwnershipClaimEvidenceUpload,
  confirmOwnershipClaimEvidenceUpload,
  submitOwnershipClaim,
  searchOwnershipClaimTargets,
} from "@/lib/bridge/ownership-claims";

export const Route = createFileRoute("/creator-ownership-claims")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: CreatorOwnershipClaims,
});

const EVIDENCE_OPTIONS = [
  ["SIGNED_OWNERSHIP_DECLARATION", "Signed ownership declaration"],
  ["CHAIN_OF_TITLE", "Chain-of-title records"],
  ["NEGATIVE_RIGHTS_CERTIFICATE", "Negative-rights certificate"],
  ["CBFC_CERTIFICATE", "CBFC certificate"],
  ["PRODUCER_ASSOCIATION_CERTIFICATE", "Producer association certificate"],
  ["PRIOR_ASSIGNMENT", "Prior assignments or transfers"],
  ["EXCLUDED_RIGHTS_SCHEDULE", "Excluded-rights schedule"],
  ["AUTHORIZATION_LETTER", "Authorization letter"],
  ["OTHER", "Other supporting film/business record"],
] as const;

function CreatorOwnershipClaims() {
  return (
    <RequireBridge allow="creator">
      {(actor) => (
        <BridgeShell actor={actor} title="Ownership claim & evidence">
          <OwnershipClaimsBody actorUserId={actor.userId} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function OwnershipClaimsBody({ actorUserId }: { actorUserId: string }) {
  const qc = useQueryClient();
  const claimsQ = useQuery({ queryKey: ["my-ownership-claims"], queryFn: () => listMyOwnershipClaims(), retry: 1 });
  const [titleId, setTitleId] = useState("");
  const [titleSearchQuery, setTitleSearchQuery] = useState("");
  const [producerEntityName, setProducerEntityName] = useState("");
  const [claimantCapacity, setClaimantCapacity] = useState("PRODUCER");
  const [claimBasis, setClaimBasis] = useState("SOLE_NEGATIVE_RIGHTS");
  const [declarationText, setDeclarationText] = useState("");
  const [attested, setAttested] = useState(false);
  const [activeClaimId, setActiveClaimId] = useState("");
  const [category, setCategory] = useState<(typeof EVIDENCE_OPTIONS)[number][0]>("SIGNED_OWNERSHIP_DECLARATION");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claims = claimsQ.data?.claims ?? [];
  const editableClaim = useMemo(
    () => claims.find((claim) => claim.id === activeClaimId) ??
      claims.find((claim) => claim.status === "DRAFT" || claim.status === "NEEDS_INFORMATION"),
    [claims, activeClaimId],
  );

  const searchMutation = useMutation({
    mutationFn: () => searchOwnershipClaimTargets({ data: {
      titleNameQuery: titleSearchQuery,
      producerEntityName,
    } }),
    onSuccess: () => {
      setTitleId("");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No matching Producer-credit title was found."),
  });

  const createMutation = useMutation({
    mutationFn: () => createOwnershipClaim({ data: {
      titleId, producerEntityName, claimantCapacity: claimantCapacity as "PRODUCER" | "PROPRIETOR" | "AUTHORIZED_REPRESENTATIVE" | "RIGHTS_SUCCESSOR" | "OTHER",
      claimBasis: claimBasis as "SOLE_NEGATIVE_RIGHTS" | "RIGHTS_OWNER" | "CHAIN_OF_TITLE" | "AUTHORIZATION" | "OTHER",
      declarationText, attested: true,
    } }),
    onSuccess: async (result) => {
      setActiveClaimId(result.claimId);
      setNotice(result.alreadyExists ? "An active claim already exists. Continue adding the requested evidence." : "Draft claim created. Add the required evidence before submitting.");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["my-ownership-claims"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not create claim."),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!editableClaim || !file) throw new Error("Select an evidence file.");
      if (file.size > 40 * 1024 * 1024) throw new Error("Each evidence file must be 40 MB or smaller.");
      const upload = await requestOwnershipClaimEvidenceUpload({ data: {
        claimId: editableClaim.id,
        category,
        fileName: file.name,
        contentType: file.type as "application/pdf" | "image/jpeg" | "image/png",
        byteSize: file.size,
      } });
      const response = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: upload.requiredHeader,
        body: file,
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Evidence upload failed (${response.status}).`);
      await confirmOwnershipClaimEvidenceUpload({ data: { claimId: editableClaim.id, evidenceId: upload.evidenceId } });
      return upload.evidenceId;
    },
    onSuccess: async () => {
      setNotice("Evidence uploaded and verified against its stored object metadata.");
      setError(null);
      setFile(null);
      await qc.invalidateQueries({ queryKey: ["my-ownership-claims"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not upload evidence."),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!editableClaim) throw new Error("Create or select a draft claim first.");
      return submitOwnershipClaim({ data: { claimId: editableClaim.id } });
    },
    onSuccess: async () => {
      setNotice("Claim submitted for Super Admin intake. This does not change the recorded title owner or original asset attribution.");
      setError(null);
      setActiveClaimId("");
      await qc.invalidateQueries({ queryKey: ["my-ownership-claims"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not submit claim."),
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-1 pb-16">
      <header className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Creator · Ownership evidence</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Submit an ownership claim</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
          Use this workflow when a title is recorded under a different Bridge account. Your claim creates a
          separate evidence case; it does not adopt the title, expose its original assets, or change uploader history.
        </p>
      </header>

      {notice ? <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-line bg-surface p-3 text-sm text-accent">{error}</p> : null}

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">1. Claim details</h2>
        <p className="mt-1 text-sm text-muted">The title owner shown by Bridge remains unchanged while this claim is reviewed.</p>
        <form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Producer / business entity named in the documents</span>
            <input className="rounded-md border border-line bg-bg px-3 py-2" value={producerEntityName} onChange={(event) => { setProducerEntityName(event.target.value); setTitleId(""); }} maxLength={200} required />
          </label>
          <div className="grid gap-2 text-sm">
            <label className="grid gap-1.5">
              <span className="font-medium">Search for the title</span>
              <input className="rounded-md border border-line bg-bg px-3 py-2" value={titleSearchQuery} onChange={(event) => { setTitleSearchQuery(event.target.value); setTitleId(""); }} maxLength={160} placeholder="Enter the film title" />
            </label>
            <p className="text-xs text-muted">This search uses the Producer credit only to locate a candidate title. It does not verify ownership or reveal original assets.</p>
            <button type="button" disabled={searchMutation.isPending || titleSearchQuery.trim().length < 3 || producerEntityName.trim().length < 3} onClick={() => searchMutation.mutate()} className="w-fit rounded-full border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40">
              {searchMutation.isPending ? "Searching…" : "Find title"}
            </button>
            {searchMutation.data?.titles?.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {searchMutation.data.titles.map((candidate) => (
                  <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <p className="font-medium">{candidate.name}</p>
                      <p className="text-xs text-muted">Producer credit: {candidate.producerCredit} · {candidate.status}</p>
                    </div>
                    <button type="button" onClick={() => setTitleId(candidate.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${titleId === candidate.id ? "bg-accent text-bg" : "border border-line"}`}>
                      {titleId === candidate.id ? "Selected" : "Use this title"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchMutation.isSuccess ? (
              <p className="text-xs text-muted">No title matched both the title search and Producer credit. No title or asset access was granted.</p>
            ) : null}
            {titleId ? <p className="text-xs text-accent">Title candidate selected for a claim. The existing title owner remains unchanged.</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Your relationship to the title</span>
              <select className="rounded-md border border-line bg-bg px-3 py-2" value={claimantCapacity} onChange={(event) => setClaimantCapacity(event.target.value)}>
                <option value="PRODUCER">Producer</option>
                <option value="PROPRIETOR">Proprietor</option>
                <option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option>
                <option value="RIGHTS_SUCCESSOR">Rights successor</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Basis of claim</span>
              <select className="rounded-md border border-line bg-bg px-3 py-2" value={claimBasis} onChange={(event) => setClaimBasis(event.target.value)}>
                <option value="SOLE_NEGATIVE_RIGHTS">Sole negative rights</option>
                <option value="RIGHTS_OWNER">Rights owner</option>
                <option value="CHAIN_OF_TITLE">Chain of title</option>
                <option value="AUTHORIZATION">Written authorization</option>
                <option value="OTHER">Other / mixed basis</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Explain the claim and disclose known prior assignments, exclusions or limitations</span>
            <textarea className="min-h-32 rounded-md border border-line bg-bg px-3 py-2" value={declarationText} onChange={(event) => setDeclarationText(event.target.value)} minLength={80} maxLength={5000} required />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} required className="mt-1" />
            <span>I confirm this statement is accurate to the best of my knowledge and that I have disclosed known assignments, excluded rights and disputes.</span>
          </label>
          <button type="submit" disabled={createMutation.isPending || !attested || !titleId || !producerEntityName.trim() || declarationText.trim().length < 80} className="w-fit rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
            {createMutation.isPending ? "Saving…" : "Save draft claim"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">2. Evidence documents</h2>
        <p className="mt-1 text-sm text-muted">
          Upload signed declarations and film/business rights records. Evidence is stored in private OCI storage,
          separate from the film's original master assets and upload history.
        </p>
        <p className="mt-2 text-xs text-muted">
          Do not upload Aadhaar, PAN, or other personal identity documents here. Provide only film, company and chain-of-title records relevant to the claim.
        </p>
        {editableClaim ? (
          <div className="mt-4 grid gap-4">
            <p className="text-sm">Draft: <strong>{editableClaim.titleName ?? editableClaim.id}</strong> · {editableClaim.status}</p>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Evidence type</span>
              <select className="rounded-md border border-line bg-bg px-3 py-2" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                {EVIDENCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Choose a PDF, JPEG or PNG file (max 40 MB)</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="button" disabled={!file || uploadMutation.isPending} onClick={() => uploadMutation.mutate()} className="w-fit rounded-full border border-line px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
              {uploadMutation.isPending ? "Uploading and verifying…" : "Upload evidence securely"}
            </button>
            <div className="rounded-lg border border-line p-3">
              <p className="text-sm font-medium">Submission requirements</p>
              <p className="mt-1 text-xs text-muted">A signed ownership declaration plus at least one chain-of-title, negative-rights, prior-assignment or authorization document are required.</p>
              <button type="button" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()} className="mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
                {submitMutation.isPending ? "Submitting…" : "Submit claim for review"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Save a draft claim first to attach evidence.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">3. Claim status</h2>
        {claimsQ.isPending ? <p className="mt-3 text-sm text-muted">Loading claims…</p> : claimsQ.isError ? <p role="alert" className="mt-3 text-sm text-accent">Claim status is unavailable. Retry the page.</p> : claims.length ? (
          <ul className="mt-3 divide-y divide-line">
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{claim.titleName}</p>
                  <p className="mt-1 text-xs text-muted">{claim.producerEntityName} · {claim.status.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted">{claim.evidence.length} evidence record(s) · {claim.legalDecision ? `Legal decision: ${claim.legalDecision.replaceAll("_", " ")}` : "Legal decision pending"}</p>
                </div>
                {claim.status === "DRAFT" || claim.status === "NEEDS_INFORMATION" ? (
                  <button type="button" onClick={() => setActiveClaimId(claim.id)} className="text-sm font-semibold text-accent underline">Continue draft</button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted">No ownership claims have been submitted from this account.</p>}
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          A Super Admin intake decision and separate Legal evidence review do not automatically transfer title ownership,
          grant rights, change the recorded uploader or publish the film to Loop.
        </p>
      </section>
    </main>
  );
}
