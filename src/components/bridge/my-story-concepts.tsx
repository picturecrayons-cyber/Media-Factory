import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMyStoryConcepts,
  updateStoryConceptRightsDeclaration,
} from "@/lib/bridge/story-concept-api";

type RightsBasis = "ORIGINAL_AUTHOR" | "ASSIGNED" | "LICENSED" | "PUBLIC_DOMAIN" | "OTHER";
type RightsDraft = {
  holder: string;
  basis: RightsBasis | "";
  thirdParty: boolean | null;
  accepted: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTRODUCED_TO_BUYERS: "Introduced",
};

function listLogline(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text.includes(" ") || !/[a-zA-Z]{3,}/.test(text)) return "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function hasCompleteRights(c: {
  rights_holder_name?: string | null;
  rights_basis?: string | null;
  third_party_materials_included?: boolean | null;
  rights_declaration_accepted_at?: string | null;
}) {
  return Boolean(
    c.rights_declaration_accepted_at &&
    c.rights_holder_name?.trim() &&
    c.rights_basis &&
    c.third_party_materials_included !== null &&
    c.third_party_materials_included !== undefined
  );
}

export function MyStoryConcepts() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, RightsDraft>>({});
  const query = useQuery({
    queryKey: ["my-story-concepts"],
    queryFn: () => listMyStoryConcepts(),
    refetchInterval: 30_000,
  });

  const rightsUpdate = useMutation({
    mutationFn: (input: {
      id: string;
      rightsHolderName: string;
      rightsBasis: RightsBasis;
      thirdPartyMaterialsIncluded: boolean;
      rightsDeclarationAccepted: true;
    }) => updateStoryConceptRightsDeclaration({ data: input }),
    onSuccess: () => {
      toast("Rights declaration saved");
      void qc.invalidateQueries({ queryKey: ["my-story-concepts"] });
      void qc.invalidateQueries({ queryKey: ["admin-story-concepts"] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not save rights declaration"),
  });

  if (query.isLoading) return <p className="text-sm text-muted">Loading concepts…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-accent">Story / Concept records could not be loaded.</p>;

  const concepts = query.data?.concepts ?? [];
  if (!concepts.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Story concepts</h2>
      <p className="mb-3 text-xs text-muted">
        Original IP submissions are separate from finished-film workspaces and licensing.
      </p>
      <ul className="divide-y divide-line rounded-sm border border-line">
        {concepts.map((c) => {
          const logline = listLogline(c.logline);
          const rightsComplete = hasCompleteRights(c);
          const draft = drafts[c.id] ?? {
            holder: c.rights_holder_name ?? "",
            basis: (c.rights_basis ?? "") as RightsBasis | "",
            thirdParty: c.third_party_materials_included ?? null,
            accepted: rightsComplete,
          };
          const canUpdateRights = ["PENDING", "UNDER_REVIEW"].includes(c.curation_status);

          return (
            <li key={c.id} className="space-y-3 px-4 py-4">
              <div>
                <p className="font-medium">{c.titleName || "Concept"}</p>
                <p className="text-sm text-muted">
                  {STATUS_LABEL[c.curation_status] ?? c.curation_status}
                  {logline ? ` · ${logline}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Submission ID: <span className="font-mono">{c.id}</span>
                </p>
              </div>

              {rightsComplete ? (
                <p className="text-xs text-muted">Rights declaration recorded and awaiting review.</p>
              ) : canUpdateRights ? (
                <form
                  className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!draft.holder.trim() || !draft.basis || draft.thirdParty === null || !draft.accepted) return;
                    rightsUpdate.mutate({
                      id: c.id,
                      rightsHolderName: draft.holder,
                      rightsBasis: draft.basis,
                      thirdPartyMaterialsIncluded: draft.thirdParty,
                      rightsDeclarationAccepted: true,
                    });
                  }}
                >
                  <p className="text-sm font-semibold sm:col-span-2">Complete rights declaration</p>
                  <label className="text-xs">
                    Rights holder name
                    <input
                      required
                      maxLength={200}
                      value={draft.holder}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [c.id]: { ...draft, holder: event.target.value },
                      }))}
                      className="mt-1 h-10 w-full rounded-lg border border-line bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    Rights basis
                    <select
                      required
                      value={draft.basis}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [c.id]: { ...draft, basis: event.target.value as RightsBasis | "" },
                      }))}
                      className="mt-1 h-10 w-full rounded-lg border border-line bg-background px-3 text-sm"
                    >
                      <option value="">Select rights basis</option>
                      <option value="ORIGINAL_AUTHOR">Original author</option>
                      <option value="ASSIGNED">Rights assigned</option>
                      <option value="LICENSED">Licensed rights</option>
                      <option value="PUBLIC_DOMAIN">Public domain</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="text-xs sm:col-span-2">
                    Third-party material included?
                    <select
                      required
                      value={draft.thirdParty === null ? "" : draft.thirdParty ? "yes" : "no"}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [c.id]: { ...draft, thirdParty: event.target.value === "" ? null : event.target.value === "yes" },
                      }))}
                      className="mt-1 h-10 w-full rounded-lg border border-line bg-background px-3 text-sm"
                    >
                      <option value="">Select yes or no</option>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-xs leading-relaxed text-muted sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={draft.accepted}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [c.id]: { ...draft, accepted: event.target.checked },
                      }))}
                    />
                    I confirm that I own these rights or have authority to submit this material, and the declaration is accurate.
                  </label>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={rightsUpdate.isPending || !draft.holder.trim() || !draft.basis || draft.thirdParty === null || !draft.accepted}
                    >
                      {rightsUpdate.isPending ? "Saving…" : "Submit rights declaration"}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-accent">
                  Rights declaration is not verified. Contact the Bridge team; this submission cannot be approved yet.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
