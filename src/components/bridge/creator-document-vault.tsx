import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmCreatorDocumentUpload,
  listCreatorDocuments,
  linkCreatorDocumentToTitle,
  listTitleDocumentEvidence,
  requestCreatorDocumentDownload,
  requestCreatorDocumentUpload,
  revokeCreatorDocument,
} from "@/lib/bridge/creator-documents";
import { listTitles } from "@/lib/bridge/titles";

const DOCUMENT_TYPES = [
  ["FINISHED_FILM_AGREEMENT", "Finished-film agreement"],
  ["STORY_CONCEPT_AGREEMENT", "Story / concept agreement"],
  ["DISTRIBUTION_AGREEMENT", "Distribution agreement"],
  ["OWNERSHIP_CHAIN_OF_TITLE", "Ownership / chain of title"],
  ["AUTHOR_ASSIGNMENT", "Author assignment"],
  ["MUSIC_RIGHTS", "Music rights"],
  ["OTHER", "Other supporting document"],
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number][0];

function message(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function CreatorDocumentVault() {
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>("FINISHED_FILM_AGREEMENT");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState<DocumentType>("FINISHED_FILM_AGREEMENT");
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");

  const documentsQ = useQuery({
    queryKey: ["bridge-creator-documents"],
    queryFn: () => listCreatorDocuments(),
    retry: 1,
  });
  const titlesQ = useQuery({
    queryKey: ["bridge-titles-for-document-vault"],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const titles = useMemo(() => titlesQ.data?.titles ?? [], [titlesQ.data]);
  const evidenceQ = useQuery({
    queryKey: ["bridge-title-document-evidence", selectedTitle],
    queryFn: () => listTitleDocumentEvidence({ data: { titleId: selectedTitle } }),
    enabled: Boolean(selectedTitle),
    retry: 1,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Choose a PDF document first.");
      if (selectedFile.type !== "application/pdf") throw new Error("Only PDF documents are accepted.");
      if (selectedFile.size <= 0 || selectedFile.size > 50 * 1024 * 1024) {
        throw new Error("The PDF must be smaller than or equal to 50 MB.");
      }
      const signed = await requestCreatorDocumentUpload({
        data: {
          documentType,
          fileName: selectedFile.name,
          contentType: "application/pdf",
          byteSize: selectedFile.size,
        },
      });
      const uploaded = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: selectedFile,
      });
      if (!uploaded.ok) throw new Error(`Private storage upload failed (HTTP ${uploaded.status}).`);
      return confirmCreatorDocumentUpload({ data: { documentId: signed.documentId } });
    },
    onSuccess: async () => {
      setSelectedFile(null);
      setNotice("Document uploaded and verified. It can now be linked to an eligible title.");
      setErrorText("");
      await queryClient.invalidateQueries({ queryKey: ["bridge-creator-documents"] });
    },
    onError: (error) => {
      setErrorText(message(error));
      setNotice("");
    },
  });

  const linkMutation = useMutation({
    mutationFn: () => {
      if (!selectedTitle) throw new Error("Choose a title.");
      if (!selectedDocumentId) throw new Error("Choose a verified document.");
      return linkCreatorDocumentToTitle({
        data: { titleId: selectedTitle, documentId: selectedDocumentId, evidenceType },
      });
    },
    onSuccess: async () => {
      setNotice("Verified evidence linked to the selected title. Legal review remains separate.");
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bridge-title-document-evidence", selectedTitle] }),
        queryClient.invalidateQueries({ queryKey: ["title-document-evidence", selectedTitle] }),
        queryClient.invalidateQueries({ queryKey: ["title-workflow", selectedTitle] }),
      ]);
    },
    onError: (error) => {
      setErrorText(message(error));
      setNotice("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (documentId: string) => revokeCreatorDocument({
      data: { documentId, note: "Owner-requested document revocation" },
    }),
    onSuccess: async () => {
      setNotice("Document access revoked. The stored object was not deleted.");
      setErrorText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bridge-creator-documents"] }),
        queryClient.invalidateQueries({ queryKey: ["bridge-title-document-evidence"] }),
      ]);
    },
    onError: (error) => {
      setErrorText(message(error));
      setNotice("");
    },
  });

  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const verifiedDocuments = (documentsQ.data?.documents ?? []).filter((doc) => doc.status === "VERIFIED");

  async function download(documentId: string) {
    setErrorText("");
    try {
      const result = await requestCreatorDocumentDownload({ data: { documentId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorText(message(error));
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Private legal evidence</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Creator / Studio Document Vault</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Upload signed PDF agreements once, then link verified copies to titles you own. Documents stay private;
          uploading or linking evidence does not approve rights or publish a title.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line p-4 space-y-3">
          <h3 className="font-semibold">Upload a document</h3>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Document type</span>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">PDF file · maximum 50 MB</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:font-semibold" />
          </label>
          {selectedFile ? <p className="text-xs text-muted">{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p> : null}
          <button type="button" disabled={!selectedFile || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
            {uploadMutation.isPending ? "Uploading and verifying…" : "Upload & verify"}
          </button>
          <p className="text-xs text-muted">A document appears as reusable evidence only after private-storage verification succeeds.</p>
        </div>

        <div className="rounded-xl border border-line p-4 space-y-3">
          <h3 className="font-semibold">Link evidence to a title</h3>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Your title</span>
            <select value={selectedTitle} onChange={(event) => setSelectedTitle(event.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="">Select a title</option>
              {titles.map((title) => <option key={title.id} value={title.id}>{title.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Verified document</span>
            <select value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="">Select a verified document</option>
              {verifiedDocuments.map((doc) => <option key={doc.id} value={doc.id}>{doc.file_name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Evidence category (must match document)</span>
            <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as DocumentType)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedTitle || !selectedDocumentId || linkMutation.isPending}
            onClick={() => linkMutation.mutate()}
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {linkMutation.isPending ? "Linking…" : "Link evidence"}
          </button>
        </div>
      </div>

      {errorText ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">{errorText}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-line bg-bg p-3 text-sm">{notice}</p> : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Your documents</h3>
          <span className="text-xs text-muted">Only your Creator account or Studio organization documents</span>
        </div>
        {documentsQ.isPending ? <p className="text-sm text-muted">Loading documents…</p> : null}
        {documentsQ.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 p-3 text-sm">
            <p>Documents could not be loaded. {message(documentsQ.error)}</p>
            <button type="button" disabled={documentsQ.isFetching}
              onClick={() => void documentsQ.refetch()}
              className="rounded-full border border-line-strong px-3 py-1.5 font-semibold disabled:opacity-50">
              {documentsQ.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : null}
        {!documentsQ.isPending && !documentsQ.isError && !documentsQ.data?.documents.length
          ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">No documents uploaded yet.</p>
          : null}
        {(documentsQ.data?.documents ?? []).map((doc) => (
          <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{doc.file_name}</p>
              <p className="mt-1 text-xs text-muted">{doc.document_type.replaceAll("_", " ")} · {doc.status} · {doc.byte_size ? `${(Number(doc.byte_size) / (1024 * 1024)).toFixed(2)} MB` : "size unavailable"}</p>
            </div>
            <div className="flex items-center gap-3">
              {doc.status === "VERIFIED" ? <button type="button" onClick={() => void download(doc.id)} className="text-sm font-semibold text-accent hover:underline">Secure download</button> : null}
              <button type="button" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(doc.id)} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50">Revoke</button>
            </div>
          </div>
        ))}
      </div>

      {selectedTitle ? (
        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="font-semibold">Evidence linked to selected title</h3>
          {evidenceQ.isPending ? <p className="text-sm text-muted">Loading linked evidence…</p> : null}
          {evidenceQ.isError ? <p className="text-sm text-muted">Linked evidence could not be loaded.</p> : null}
          {(evidenceQ.data?.evidence ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium">{item.file_name}</p>
              <p className="mt-1 text-xs text-muted">{item.evidence_type.replaceAll("_", " ")} · verified evidence reference</p>
            </div>
          ))}
          {!evidenceQ.isPending && !evidenceQ.isError && !evidenceQ.data?.evidence.length
            ? <p className="text-sm text-muted">No verified evidence linked to this title yet.</p>
            : null}
        </div>
      ) : null}
    </section>
  );
}
