import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmTitleOwnerEvidenceUpload,
  getTitleOwnerEvidenceViewUrl,
  getTitleOwnerRightsDraft,
  getTitleOwnerRightsReviewHistory,
  listTitleOwnerEvidence,
  requestTitleOwnerEvidenceUpload,
  revokePendingTitleOwnerEvidence,
  saveTitleOwnerRightsDraft,
  submitTitleOwnerRightsPackage,
} from "@/lib/bridge/creator-evidence";

type OwnerTitle = { id: string; name: string; status: string };
type EvidenceType =
  | "FINISHED_FILM_AGREEMENT"
  | "DISTRIBUTION_AGREEMENT"
  | "OWNERSHIP_CHAIN_OF_TITLE"
  | "AUTHOR_ASSIGNMENT"
  | "OTHER";

type RightsDetails = {
  platforms: Array<"SVOD" | "TVOD" | "AVOD">;
  territory: string;
  rightsStart: string;
  rightsEnd: string;
  rightsBasis: string;
  signatoryName: string;
  signatoryCapacity: string;
  revenueShare: string;
  paymentTerms: string;
  ownerDeclaration: boolean;
};

const EMPTY: RightsDetails = {
  platforms: [],
  territory: "",
  rightsStart: "",
  rightsEnd: "",
  rightsBasis: "",
  signatoryName: "",
  signatoryCapacity: "",
  revenueShare: "",
  paymentTerms: "",
  ownerDeclaration: false,
};

const UPLOADS: Array<{ type: EvidenceType; label: string; help: string }> = [
  { type: "FINISHED_FILM_AGREEMENT", label: "Signed OTT Rights Agreement", help: "Signed agreement covering the requested OTT rights" },
  { type: "DISTRIBUTION_AGREEMENT", label: "K.M. Mathew original signed LOA", help: "Original signed authorization / letter of authority" },
  { type: "OWNERSHIP_CHAIN_OF_TITLE", label: "Ownership and rights-transfer proof", help: "Upload each supporting ownership / transfer document separately" },
  { type: "AUTHOR_ASSIGNMENT", label: "Signatory authority proof", help: "Proof that the person signing can bind the rights holder" },
  { type: "OTHER", label: "Signed revenue-sharing agreement", help: "Signed revenue-share agreement or addendum" },
];

function countType(documents: Array<{ document_type: string; status: string }>, type: string) {
  return documents.filter((doc) => doc.document_type === type && doc.status === "VERIFIED").length;
}

export function CreatorEvidenceDesk({ titles, ownerType = "independent_creator", titleId: fixedTitleId }: { titles: OwnerTitle[]; ownerType?: "independent_creator" | "studio"; titleId?: string }) {
  const queryClient = useQueryClient();
  const preferred = useMemo(
    () => fixedTitleId ?? titles.find((title) => title.name.toLowerCase().includes("malayalakkara residency"))?.id ?? titles[0]?.id ?? "",
    [fixedTitleId, titles],
  );
  const [titleId, setTitleId] = useState(preferred);
  const [details, setDetails] = useState<RightsDetails>(EMPTY);
  const [notice, setNotice] = useState("");
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<EvidenceType | null>(null);
  const evidenceQ = useQuery({
    queryKey: ["creator-evidence", titleId],
    queryFn: () => listTitleOwnerEvidence({ data: { titleId } }),
    enabled: Boolean(titleId),
  });
  const draftQ = useQuery({
    queryKey: ["creator-rights-draft", titleId],
    queryFn: () => getTitleOwnerRightsDraft({ data: { titleId } }),
    enabled: Boolean(titleId),
  });
  const reviewQ = useQuery({
    queryKey: ["creator-rights-review-history", titleId],
    queryFn: () => getTitleOwnerRightsReviewHistory({ data: { titleId } }),
    enabled: Boolean(titleId),
  });
  const docs = evidenceQ.data?.documents ?? [];
  const submission = draftQ.data?.submission as { details?: Partial<RightsDetails>; submission_status?: string } | null | undefined;
  const locked = submission?.submission_status === "SUBMITTED";

  useEffect(() => {
    if (preferred && !titleId) setTitleId(preferred);
  }, [preferred, titleId]);
  useEffect(() => {
    if (draftQ.data?.submission?.details) {
      setDetails({ ...EMPTY, ...(draftQ.data.submission.details as Partial<RightsDetails>) });
    } else {
      setDetails(EMPTY);
    }
  }, [titleId, draftQ.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveTitleOwnerRightsDraft({ data: { titleId, details } }),
    onSuccess: async () => {
      setNotice("Draft saved. No legal or publication approval was granted.");
      await queryClient.invalidateQueries({ queryKey: ["creator-rights-draft", titleId] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save the draft."),
  });
  const submitMutation = useMutation({
    mutationFn: () => submitTitleOwnerRightsPackage({ data: { titleId, details } }),
    onSuccess: async () => {
      setNotice("Rights package submitted for independent Legal review. The title status and publication state were not changed.");
      await queryClient.invalidateQueries({ queryKey: ["creator-rights-draft", titleId] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not submit the package."),
  });

  async function upload(type: EvidenceType, file?: File) {
    if (!file) return;
    setBusyType(type);
    setNotice("");
    try {
      if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Upload a PDF document only.");
      }
      if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
        throw new Error("Each PDF must be smaller than or equal to 20 MB.");
      }
      const requested = await requestTitleOwnerEvidenceUpload({
        data: { titleId, documentType: type, fileName: file.name, byteSize: file.size },
      });
      const response = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: file,
      });
      if (!response.ok) throw new Error(`Storage upload failed (${response.status}). Use Undo on the pending upload and retry.`);
      await confirmTitleOwnerEvidenceUpload({ data: { titleId, documentId: requested.documentId } });
      setNotice("PDF uploaded and storage-verified. Legal review is still required.");
      await queryClient.invalidateQueries({ queryKey: ["creator-evidence", titleId] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
      await queryClient.invalidateQueries({ queryKey: ["creator-evidence", titleId] });
    } finally {
      setBusyType(null);
    }
  }

  async function undo(documentId: string) {
    try {
      await revokePendingTitleOwnerEvidence({ data: { titleId, documentId } });
      setNotice("Pending upload undone. Verified evidence cannot be deleted; upload a replacement to preserve the audit trail.");
      await queryClient.invalidateQueries({ queryKey: ["creator-evidence", titleId] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Undo failed.");
    }
  }

  async function previewDocument(documentId: string) {
    setViewingDocumentId(documentId);
    try {
      const result = await getTitleOwnerEvidenceViewUrl({ data: { titleId, documentId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Document preview unavailable.");
    } finally {
      setViewingDocumentId(null);
    }
  }

  if (!titles.length) return null;

  const platformsComplete = details.platforms.length > 0;
  const ownershipCount = countType(docs, "OWNERSHIP_CHAIN_OF_TITLE");
  const requirements = [
    ["Signed OTT Rights Agreement", countType(docs, "FINISHED_FILM_AGREEMENT") > 0],
    ["SVOD, TVOD and AVOD rights confirmation", platformsComplete],
    ["Worldwide territory confirmation", /worldwide|world wide|global/i.test(details.territory)],
    ["Rights duration and expiry", Boolean(details.rightsStart && details.rightsEnd)],
    ["K.M. Mathew original signed LOA", countType(docs, "DISTRIBUTION_AGREEMENT") > 0],
    ["Film ownership proof", ownershipCount > 0],
    ["New Darsan Creations rights-transfer proof", ownershipCount > 1],
    ["Signatory authority proof", countType(docs, "AUTHOR_ASSIGNMENT") > 0],
    ["Signed revenue-sharing agreement", countType(docs, "OTHER") > 0],
    ["Revenue-share and payment terms", Boolean(details.revenueShare && details.paymentTerms)],
    ["Independent Legal Reviewer approval", false],
    ["Crayons LOOP publication approval", false],
  ] as const;

  return (
    <section id="rights-evidence" className="scroll-mt-20 space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">{ownerType === "studio" ? "Studio owner evidence desk" : "Creator evidence desk"}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Rights Clearance & Legal Documents</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Upload signed PDFs and enter the rights terms exactly as stated in your agreements. Uploads and declarations are evidence for review, not legal clearance or publication approval.
          </p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Private · owner-scoped</span>
      </div>

      <label className="block max-w-xl text-sm font-medium">
        Select title
        <select value={titleId} disabled={Boolean(fixedTitleId)} onChange={(event) => setTitleId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-bg px-3">
          {titles.map((title) => <option key={title.id} value={title.id}>{title.name} · {title.status.replaceAll("_", " ")}</option>)}
        </select>
      </label>

      <div className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Document Manager</h3>
          <span className="text-xs text-muted">PDF only · max 20 MB each</span>
        </div>
        <p className="mt-1 text-xs text-muted">Upload the ownership proof and rights-transfer proof as two separate files under the ownership category.</p>
        <div className="mt-3 space-y-3">
          {UPLOADS.map((item) => (
            <div key={item.type} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted">{item.help}</p>
                <p className="mt-1 text-xs text-muted">
                  {docs.filter((doc) => doc.document_type === item.type && doc.status === "VERIFIED").length} verified · {docs.filter((doc) => doc.document_type === item.type && doc.status === "PENDING_UPLOAD").length} pending
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-full border border-line-strong px-3 py-2 text-xs font-semibold hover:border-accent">
                {busyType === item.type ? "Uploading…" : "Upload PDF"}
                <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={Boolean(busyType) || locked} onChange={(event) => { void upload(item.type, event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Documents can be viewed only through a time-limited private link.</span>
          <span className="text-xs text-muted">{docs.filter((doc) => doc.status === "VERIFIED").length} verified · {docs.filter((doc) => doc.status === "PENDING_UPLOAD").length} pending · {docs.filter((doc) => doc.status === "REVOKED").length} undone</span>
        </div>
        {docs.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Uploaded document history</p>
            {docs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                <div className="min-w-0">
                  <p className="break-all font-medium">{doc.file_name}</p>
                  <p className="text-muted">{doc.document_type.replaceAll("_", " ")} · {doc.status.replaceAll("_", " ")}</p>
                </div>
                {doc.status === "PENDING_UPLOAD" ? <button type="button" onClick={() => void undo(doc.id)} className="font-semibold text-accent underline">Undo pending upload</button> : null}
                {doc.status === "VERIFIED" ? (
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={viewingDocumentId === doc.id} onClick={() => void previewDocument(doc.id)} className="font-semibold text-accent underline">
                      {viewingDocumentId === doc.id ? "Opening…" : "Preview / Download"}
                    </button>
                    <span className="text-muted">Storage verified · Legal review separate</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Rights and commercial terms</h3>
          {locked ? <span className="text-xs font-semibold text-muted">SUBMITTED · awaiting Legal</span> : null}
        </div>
        <fieldset disabled={locked} className="mt-3 space-y-4 disabled:opacity-70">
          <div>
            <p className="text-sm font-medium">Platforms covered by the signed agreement (unchecked platforms are not declared)</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["SVOD", "TVOD", "AVOD"] as const).map((platform) => (
                <label key={platform} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={details.platforms.includes(platform)} onChange={(event) => setDetails((old) => ({ ...old, platforms: event.target.checked ? [...old.platforms, platform] : old.platforms.filter((value) => value !== platform) }))} />
                  {platform}
                </label>
              ))}
            </div>
          </div>
          <Field label="Territory (enter Worldwide only if the signed agreement says so)" value={details.territory} onChange={(value) => setDetails((old) => ({ ...old, territory: value }))} placeholder="e.g. Worldwide / India only / list countries" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rights start date" type="date" value={details.rightsStart} onChange={(value) => setDetails((old) => ({ ...old, rightsStart: value }))} />
            <Field label="Rights expiry date" type="date" value={details.rightsEnd} onChange={(value) => setDetails((old) => ({ ...old, rightsEnd: value }))} />
          </div>
          <Field label="Rights basis / ownership chain summary" value={details.rightsBasis} onChange={(value) => setDetails((old) => ({ ...old, rightsBasis: value }))} placeholder="Describe the rights granted and the parties in the chain" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Authorized signatory name" value={details.signatoryName} onChange={(value) => setDetails((old) => ({ ...old, signatoryName: value }))} />
            <Field label="Signatory capacity / designation" value={details.signatoryCapacity} onChange={(value) => setDetails((old) => ({ ...old, signatoryCapacity: value }))} />
          </div>
          <Field label="Revenue share terms" value={details.revenueShare} onChange={(value) => setDetails((old) => ({ ...old, revenueShare: value }))} placeholder="Enter percentages and parties exactly as agreed" />
          <Field label="Payment terms" value={details.paymentTerms} onChange={(value) => setDetails((old) => ({ ...old, paymentTerms: value }))} placeholder="Enter payment schedule, deductions and settlement terms" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={details.ownerDeclaration} onChange={(event) => setDetails((old) => ({ ...old, ownerDeclaration: event.target.checked }))} className="mt-1" />
            I confirm these details are entered from the documents submitted and are accurate to the best of my knowledge.
          </label>
        </fieldset>
        {!locked ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setDetails({ ...EMPTY, ...(draftQ.data?.submission?.details as Partial<RightsDetails> | undefined) })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">Undo unsaved edits</button>
            <button type="button" disabled={saveMutation.isPending || !titleId} onClick={() => saveMutation.mutate()} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold disabled:opacity-50">{saveMutation.isPending ? "Saving…" : "Save draft"}</button>
            <button type="button" disabled={submitMutation.isPending || !details.ownerDeclaration || !titleId} onClick={() => submitMutation.mutate()} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{submitMutation.isPending ? "Submitting…" : "Submit to Legal Review"}</button>
          </div>
        ) : null}
        {notice ? <p role="status" className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm">{notice}</p> : null}
        {draftQ.isError || evidenceQ.isError ? <p role="alert" className="mt-3 text-sm text-red-600">Could not load evidence data. Refresh and retry.</p> : null}
      </div>

      <div className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">12-point clearance checklist</h3>
        <p className="mt-1 text-xs text-muted">{ownerType === "studio" ? "Studio organization evidence is visible only to active members of the title-owning Studio. " : ""}Owner evidence is tracked separately from reviewer decisions. The last two approvals are controlled by authorized staff.</p>
        <ol className="mt-3 space-y-2">
          {requirements.map(([label, complete], index) => (
            <li key={label} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 w-6 shrink-0 text-xs tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
              <span className="flex-1">{label}</span>
              <span className={complete ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-muted"}>{complete ? "Evidence present" : index >= 10 ? "Staff-controlled" : "Pending"}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">Submission & review history</h3>
        <p className="mt-1 text-xs text-muted">Status and reviewer activity are displayed from recorded Bridge events. Owner uploads do not count as legal verification.</p>
        <p className="mt-3 text-sm">Current submission: <strong>{submission?.submission_status?.replaceAll("_", " ") ?? "NOT STARTED"}</strong></p>
        {reviewQ.isPending ? <p className="mt-2 text-xs text-muted">Loading review history…</p> : null}
        {reviewQ.isError ? <p role="alert" className="mt-2 text-xs text-muted">Review history is currently unavailable.</p> : null}
        {reviewQ.data?.reviewEvents?.length ? (
          <ol className="mt-3 space-y-2">
            {reviewQ.data.reviewEvents.map((event, index) => (
              <li key={index} className="border-t border-line pt-2 text-xs">
                <strong>{event.action.replaceAll(".", " ").replaceAll("_", " ")}</strong>
                <span className="ml-2 text-muted">{new Date(event.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-xs text-muted">No staff review events recorded yet.</p>}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Important: an uploaded PDF or Creator declaration never marks rights as cleared. Legal review, QC, licensing readiness and Crayons LOOP publication remain separate approval gates. Submitted evidence is retained; corrections should be handled through the Legal Reviewer workflow and replacement uploads.
      </p>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm" />
    </label>
  );
}
