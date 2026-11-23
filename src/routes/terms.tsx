import { createFileRoute } from "@tanstack/react-router";
import { LEGAL_DOCUMENTS, LegalPage } from "@/components/bridge/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });
function Terms() { return <LegalPage document={LEGAL_DOCUMENTS["b2b-terms"]!} />; }
