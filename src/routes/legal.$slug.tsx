import { createFileRoute, notFound } from "@tanstack/react-router";
import { LEGAL_DOCUMENTS, LegalPage } from "@/components/bridge/legal-page";

export const Route = createFileRoute("/legal/$slug")({
  component: LegalDocumentRoute,
  notFoundComponent: () => <main className="p-8">Legal document not found.</main>,
});

function LegalDocumentRoute() {
  const { slug } = Route.useParams();
  const document = LEGAL_DOCUMENTS[slug];
  if (!document) throw notFound();
  return <LegalPage document={document} />;
}
