import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import {
  approveStoryConceptDownload,
  approveStoryConceptForBuyerView,
  createInvestmentInterest,
  listBuyerLoopTitles,
  listBuyerOrganizations,
  listInvestmentInterestActivity,
  listLegacyBuyerMappingEvidence,
  listStoryConceptApprovalQueue,
  listViewerPublicTitles,
  mapLegacyBuyer,
  requestLoopTrailer,
  requestStoryConceptDownload,
} from "@/lib/bridge/buyer-loop";

export const Route = createFileRoute("/buyer-loop")({ component: BuyerLoopPage });

function BuyerLoopPage() {
  return (
    <RequireBridge>
      {(actor) => {
        const mode =
          actor.internalRole === "super_admin" ? "super_admin" :
          actor.internalRole === "viewer" ? "viewer" :
          actor.accountType === "buyer" ? "buyer" :
          actor.accountType === "investor" ? "investor" : "denied";
        if (mode === "denied") {
          return <BridgeShell actor={actor} title="Buyer Loop"><p className="rounded-2xl border border-line bg-surface p-6 text-sm">This workspace is limited to Buyer, Investor, Viewer and Super Admin roles.</p></BridgeShell>;
        }
        return <BridgeShell actor={actor} title="Buyer Loop"><BuyerLoopDesk mode={mode} /></BridgeShell>;
      }}
    </RequireBridge>
  );
}

function BuyerLoopDesk({ mode }: { mode: "buyer" | "investor" | "viewer" | "super_admin" }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [accountType, setAccountType] = useState<"buyer" | "investor">("buyer");
  const buyerMode = mode === "buyer" || mode === "investor";
  const titlesQ = useQuery({
    queryKey: ["buyer-loop-titles", mode],
    queryFn: () => mode === "viewer" ? listViewerPublicTitles() : listBuyerLoopTitles(),
  });
  const legacyQ = useQuery({
    queryKey: ["legacy-buyer-evidence"],
    queryFn: () => listLegacyBuyerMappingEvidence(),
    enabled: mode === "super_admin",
  });
  const conceptQ = useQuery({
    queryKey: ["story-concept-final-approval"],
    queryFn: () => listStoryConceptApprovalQueue(),
    enabled: mode === "super_admin",
  });
  const orgQ = useQuery({
    queryKey: ["buyer-organizations"],
    queryFn: () => listBuyerOrganizations(),
    enabled: mode === "super_admin",
  });
  const interestQ = useQuery({
    queryKey: ["investment-interest-activity"],
    queryFn: () => listInvestmentInterestActivity(),
    enabled: mode === "super_admin",
  });
  const trailerM = useMutation({
    mutationFn: (loopTitleId: string) => requestLoopTrailer({ data: { loopTitleId } }),
    onSuccess: (result) => setTrailerUrl(result.url),
    onError: (error) => setMessage(error instanceof Error ? error.message : "Trailer unavailable"),
  });
  const interestM = useMutation({
    mutationFn: (conceptSubmissionId: string) => createInvestmentInterest({ data: { conceptSubmissionId } }),
    onSuccess: async (result) => {
      setMessage("Interest recorded. Notification delivery: " + result.emailDelivery.status + (result.emailDelivery.failure ? " — " + result.emailDelivery.failure : ""));
      await qc.invalidateQueries({ queryKey: ["buyer-loop-titles"] });
      await qc.invalidateQueries({ queryKey: ["investment-interest-activity"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Interest could not be recorded"),
  });
  const downloadM = useMutation({
    mutationFn: (args: { conceptSubmissionId: string; asset: "treatment" | "screenplay" }) => requestStoryConceptDownload({ data: args }),
    onSuccess: (result) => setDownloadUrl(result.url),
    onError: (error) => setMessage(error instanceof Error ? error.message : "Story Concept download denied"),
  });
  const approveM = useMutation({
    mutationFn: (conceptSubmissionId: string) => approveStoryConceptForBuyerView({ data: { conceptSubmissionId } }),
    onSuccess: async () => {
      setMessage("Story Concept final approval recorded.");
      await qc.invalidateQueries({ queryKey: ["story-concept-final-approval"] });
      await qc.invalidateQueries({ queryKey: ["buyer-loop-titles"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Final approval failed"),
  });
  const approveDownloadM = useMutation({
    mutationFn: (conceptSubmissionId: string) => approveStoryConceptDownload({ data: { conceptSubmissionId, organizationId, accountType } }),
    onSuccess: async () => {
      setMessage("Organization-specific Story Concept download approval recorded.");
      await qc.invalidateQueries({ queryKey: ["buyer-loop-titles"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Download approval failed"),
  });
  const mapM = useMutation({
    mutationFn: (args: { sourceTable: string; legacyId: string }) => mapLegacyBuyer({ data: args }),
    onSuccess: async (result) => {
      setMessage(result.alreadyMapped ? "Existing Buyer mapping verified." : "Buyer mapping persisted with evidence.");
      await qc.invalidateQueries({ queryKey: ["legacy-buyer-evidence"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Mapping blocked"),
  });
  const titles = (titlesQ.data as any)?.titles ?? [];
  const legacy = legacyQ.data?.evidence ?? [];
  const concepts = conceptQ.data?.queue ?? [];
  const organizations = orgQ.data?.organizations ?? [];
  const interestActivity = interestQ.data?.activity ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Crayons Bridge → Loop</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Published catalogue</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "viewer" ? "Public published titles only." : "Published titles only. Story Concept downloads require explicit Super Admin approval."}
        </p>
      </section>

      {titlesQ.isError ? <p role="alert" className="rounded-xl border border-line p-4 text-sm">Buyer Loop catalogue unavailable: {String(titlesQ.error)}</p> : null}
      {trailerUrl ? <div className="rounded-xl border border-line bg-surface p-4"><p className="text-sm font-semibold">Trailer ready</p><a className="mt-2 inline-block text-sm text-accent underline" href={trailerUrl} target="_blank" rel="noreferrer">Open trailer</a></div> : null}
      {downloadUrl ? <div className="rounded-xl border border-line bg-surface p-4"><p className="text-sm font-semibold">Approved Story Concept file</p><a className="mt-2 inline-block text-sm text-accent underline" href={downloadUrl} target="_blank" rel="noreferrer">Open approved download</a></div> : null}
      {message ? <p role="status" className="rounded-xl border border-line bg-surface p-3 text-sm">{message}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {titles.map((title: any) => (
          <article key={title.loop_title_id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            {title.poster_url ? <img src={title.poster_url} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="grid aspect-[16/9] place-items-center bg-elevated text-xs text-muted">Crayons Bridge</div>}
            <div className="space-y-3 p-4">
              <div><h3 className="font-display text-lg font-semibold">{title.title}</h3><p className="mt-1 text-xs text-muted">{title.release_year ?? "Year not listed"} · {title.language ?? "Language not listed"}</p></div>
              {title.synopsis ? <p className="text-sm leading-6 text-muted">{title.synopsis}</p> : null}
              {title.trailer_url ? <a href={title.trailer_url} target="_blank" rel="noreferrer" className="inline-block text-sm text-accent underline">Watch trailer</a> : <button type="button" onClick={() => trailerM.mutate(title.loop_title_id)} disabled={trailerM.isPending} className="rounded-full border border-line px-3 py-2 text-xs font-semibold">Open verified trailer</button>}
              {buyerMode || mode === "super_admin" ? (
                title.story_concept_id ? (
                  <div className="rounded-xl border border-line p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider">Story Concept · Read view</p>
                    {title.logline ? <p className="mt-2 text-sm font-medium">{title.logline}</p> : null}
                    {title.concept_synopsis ? <p className="mt-2 text-xs leading-5 text-muted">{title.concept_synopsis}</p> : null}
                    {title.concept_genre ? <p className="mt-2 text-xs text-muted">Genre: {title.concept_genre}</p> : null}
                    {title.estimated_budget_range ? <p className="mt-1 text-xs text-muted">Budget: {title.estimated_budget_range}</p> : null}
                    {buyerMode ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {title.has_interest ? <span className="rounded-full border border-line px-3 py-2 text-xs">Interest submitted</span> : <button type="button" onClick={() => interestM.mutate(title.story_concept_id)} disabled={interestM.isPending} className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-white">Investment Interest</button>}
                        {title.download_approved ? <div className="flex gap-2"><button type="button" onClick={() => downloadM.mutate({ conceptSubmissionId: title.story_concept_id, asset: "treatment" })} className="rounded-full border border-line px-3 py-2 text-xs">Download approved treatment</button><button type="button" onClick={() => downloadM.mutate({ conceptSubmissionId: title.story_concept_id, asset: "screenplay" })} className="rounded-full border border-line px-3 py-2 text-xs">Download approved screenplay</button></div> : <p className="mt-2 w-full text-xs text-muted">Story Concept download denied — Super Admin approval required.</p>}
                      </div>
                    ) : null}
                    {mode === "super_admin" && organizations.length ? (
                      <div className="mt-3 space-y-2 border-t border-line pt-3">
                        <p className="text-xs font-semibold">Approve download for an organization</p>
                        <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-bg px-2 text-xs">
                          <option value="">Select organization</option>
                          {organizations.map((org: any) => <option key={org.id} value={org.id}>{org.legal_name}</option>)}
                        </select>
                        <select value={accountType} onChange={(e) => setAccountType(e.target.value as "buyer" | "investor")} className="h-10 w-full rounded-lg border border-line bg-bg px-2 text-xs">
                          <option value="buyer">Buyer</option><option value="investor">Investor</option>
                        </select>
                        <button type="button" onClick={() => approveDownloadM.mutate(title.story_concept_id)} disabled={!organizationId || approveDownloadM.isPending} className="rounded-full border border-line px-3 py-2 text-xs font-semibold">Approve download</button>
                      </div>
                    ) : null}
                  </div>
                ) : null
              ) : null}
            </div>
          </article>
        ))}
        {!titlesQ.isPending && !titlesQ.isError && titles.length === 0 ? <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">No titles are currently published to Buyer Loop. Unpublished titles and storage records are not exposed here.</div> : null}
      </div>

      {mode === "super_admin" ? (
        <>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">Story Concept final-approval queue</h3>
            <p className="mt-1 text-sm text-muted">Only paid concepts with Legal and Editorial approval are eligible for introduction to Buyer Loop.</p>
            <div className="mt-3 space-y-3">
              {concepts.map((concept: any) => <div key={concept.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-semibold">{concept.title_name}</p><p className="mt-1 text-xs text-muted">{concept.legal_status} · {concept.editorial_status} · Fee certified: {concept.fee_certified_at ? "Yes" : "No"}</p><p className="mt-1 text-xs text-muted">{concept.logline}</p></div><button type="button" onClick={() => approveM.mutate(concept.id)} disabled={approveM.isPending} className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-white">Final approve for Buyer Loop</button></div>)}
              {!conceptQ.isPending && concepts.length === 0 ? <p className="text-sm text-muted">No paid, legally and editorially approved Story Concepts are awaiting final approval.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">Legacy buyer mapping evidence</h3>
            <p className="mt-1 text-sm text-muted">BookMyShow and Sun NXT mappings are created only when a verified buyer identity and signed-contract, purchase-order or payment evidence match a Bridge Buyer/Investor account.</p>
            <div className="mt-3 space-y-3">
              {legacy.map((item: any) => {
                const eligible = item.buyer_name && item.buyer_user_id && item.evidence_reference && ["SIGNED_CONTRACT","PURCHASE_ORDER","PAYMENT_RECEIPT"].includes(String(item.evidence_type).toUpperCase()) && ["VERIFIED","APPROVED"].includes(String(item.review_status).toUpperCase());
                return <div key={item.source_table + ":" + item.legacy_id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.title_name ?? item.bridge_title_id}</p><p className="mt-1 text-xs text-muted">{item.source_table} · Legacy ID {item.legacy_id} · Review {item.review_status}</p><p className="mt-1 text-xs text-muted">Buyer: {item.buyer_name ?? "Not evidenced"} · Evidence: {item.evidence_type ?? "Not supplied"} {item.evidence_reference ? "· " + item.evidence_reference : ""}</p></div><div className="text-right"><span className="rounded-full border border-line px-2 py-1 text-xs">{item.mapped ? "Mapped" : "Not mapped"}</span>{!item.mapped && eligible ? <button type="button" onClick={() => mapM.mutate({ sourceTable: item.source_table, legacyId: item.legacy_id })} disabled={mapM.isPending} className="mt-2 block rounded-full border border-line px-3 py-2 text-xs">Map evidenced buyer</button> : !item.mapped ? <p className="mt-2 text-xs text-muted">Mapping blocked — evidence incomplete</p> : null}</div></div>
                </div>;
              })}
              {!legacyQ.isPending && legacy.length === 0 ? <p className="text-sm text-muted">No legacy buyer-mapping evidence records are available in this STAGING workspace.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-display text-xl font-semibold">Investment-interest notifications</h3>
            <div className="mt-3 space-y-2">
              {interestActivity.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs"><div><p className="font-semibold">{item.title_name}</p><p className="mt-1 text-muted">{item.buyer_name} · {item.buyer_email} · {item.account_type}</p><p className="mt-1 text-muted">{item.created_at}</p></div><span className="rounded-full border border-line px-2 py-1">Email: {item.email_status ?? "NOT SENT"}</span></div>)}
              {!interestQ.isPending && interestActivity.length === 0 ? <p className="text-sm text-muted">No investment-interest records yet.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
