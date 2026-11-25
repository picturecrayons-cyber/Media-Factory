import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listTitles } from "@/lib/bridge/titles";
import {
  attachCreatorDocumentToTitle,
  confirmCreatorDocumentUpload,
  listMyCreatorDocuments,
  requestCreatorDocumentDownload,
  requestCreatorDocumentUpload,
} from "@/lib/bridge/creator-documents";

const DOCUMENT_TYPES = [
  ["FINISHED_FILM_AGREEMENT", "Film agreement"],
  ["DISTRIBUTION_AGREEMENT", "Distribution agreement"],
  ["OWNERSHIP_CHAIN_OF_TITLE", "Ownership / chain of title"],
  ["AUTHOR_ASSIGNMENT", "Author assignment"],
  ["MUSIC_RIGHTS", "Music rights"],
  ["STORY_CONCEPT_AGREEMENT", "Story / concept agreement"],
  ["OTHER", "Other document"],
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number][0];

export function CreatorDocumentVault() {
  const qc = useQueryClient();
  const [documentType, setDocumentType] = useState<DocumentType>("OWNERSHIP_CHAIN_OF_TITLE");
  const [titleId, setTitleId] = useState("");
  const [message, setMessage] = useState("");
  const docs = useQuery({ queryKey: ["creator-document-vault"], queryFn: () => listMyCreatorDocuments() });
  const titles = useQuery({ queryKey: ["creator-document-titles"], queryFn: () => listTitles() });
  const titleOptions = useMemo(() => titles.data?.titles ?? [], [titles.data]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const signed = await requestCreatorDocumentUpload({ data: {
        documentType, fileName: file.name, contentType: file.type, byteSize: file.size,
      } });
      const response = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Secure document upload failed (${response.status})`);
      return confirmCreatorDocumentUpload({ data: { documentId: signed.documentId, expectedByteSize: file.size } });
    },
    onSuccess: async () => {
      setMessage("Document verified and saved in your private Vault.");
      await qc.invalidateQueries({ queryKey: ["creator-document-vault"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Document upload failed"),
  });

  const attach = useMutation({
    mutationFn: (input: { documentId: string; evidenceType: DocumentType }) =>
      attachCreatorDocumentToTitle({ data: { ...input, titleId } }),
    onSuccess: async () => {
      setMessage("Document attached to the selected title. The private Vault copy remains reusable.");
      await qc.invalidateQueries({ queryKey: ["creator-document-vault"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not attach document"),
  });

  async function download(documentId: string) {
    try {
      const signed = await requestCreatorDocumentDownload({ data: { documentId } });
      window.open(signed.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download unavailable");
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Private Document Vault</p>
        <h2 className="mt-1 font-display text-xl font-semibold">Upload once. Reuse when needed.</h2>
        <p className="mt-1 text-sm text-muted">Your documents stay private. Choose an existing verified document when attaching evidence to another title.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Document type</span>
          <select value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}
            className="h-10 w-full rounded-xl border border-line-strong bg-elevated px-3">
            {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Choose document (PDF, JPG or PNG · up to 25 MB)</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) upload.mutate(file);
              event.currentTarget.value = "";
            }}
            className="block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-fg file:px-4 file:py-2 file:text-xs file:font-semibold file:text-bg" />
        </label>
        <span className="text-xs text-muted">{upload.isPending ? "Uploading and verifying…" : "Private storage"}</span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Saved documents</h3>
          <select aria-label="Choose title to attach document to" value={titleId} onChange={(event) => setTitleId(event.target.value)}
            className="h-9 min-w-56 rounded-xl border border-line-strong bg-elevated px-3 text-xs">
            <option value="">Select a title to attach…</option>
            {titleOptions.map((title: any) => <option key={title.id} value={title.id}>{title.name}</option>)}
          </select>
        </div>
        {docs.isLoading ? <p className="text-sm text-muted">Loading private documents…</p> : null}
        {docs.isError ? <p role="alert" className="text-sm text-red-600">Could not load your private Vault.</p> : null}
        {!docs.isLoading && !docs.isError && !docs.data?.documents.length
          ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No saved documents yet. Upload a document once; it can be reused for eligible titles.</p>
          : null}
        {docs.data?.documents.map((document: any) => (
          <article key={document.id} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{document.file_name}</p>
              <p className="mt-1 text-xs text-muted">{DOCUMENT_TYPES.find(([value]) => value === document.document_type)?.[1] ?? document.document_type} · {document.status} · {document.byte_size ? `${(document.byte_size / (1024 * 1024)).toFixed(1)} MB` : "—"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {document.status === "VERIFIED" ? <Button size="sm" variant="outline" onClick={() => void download(document.id)}>Download</Button> : <span className="text-xs text-muted">Awaiting verification</span>}
              {document.status === "VERIFIED" ? <Button size="sm" disabled={!titleId || attach.isPending} onClick={() => attach.mutate({ documentId: document.id, evidenceType: document.document_type === "OTHER" ? "OTHER" : document.document_type })}>Attach to title</Button> : null}
            </div>
          </article>
        ))}
      </div>
      {message ? <p role="status" className="rounded-lg border border-line p-3 text-sm">{message}</p> : null}
    </section>
  );
}
