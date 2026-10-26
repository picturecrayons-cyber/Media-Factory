import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/disclaimer")({ component: Disclaimer });

function Disclaimer() {
  return (
    <PublicPage
      title="Disclaimer"
      updated="26 October 2026"
      lede="Read this before you use Crayons Bridge as a public production service."
    >
      <p>Crayons Bridge is a workspace for title records, review, rights notes, and licensing workflow. It is not a law firm, not a guarantee of ownership, and not a promise that a buyer, licence, or payment will result.</p>
      <p>Listing a title, passing a workflow step, or showing a title to a role does not transfer copyright or grant a licence. A licence exists only in a written agreement the rights holder authorizes.</p>
      <p>Information on the public site and inside a workspace can change. The service is provided as available. See the <Link to="/terms" className="font-semibold text-accent underline">Terms</Link>.</p>
      <p>A simple file can be uploaded, viewed, and replaced on the title. The old multi-file vault is closed. Listing a file does not transfer copyright.</p>
    </PublicPage>
  );
}
