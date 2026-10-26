import { createFileRoute, Link } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/business")({ component: Business });

function Business() {
  return (
    <PublicPage
      title="Business"
      updated="26 October 2026"
      lede="Crayons Bridge is the public production workspace of StreamVista OPC Pvt Ltd for title records, review, and licensing."
    >
      <section>
        <h2 className="font-semibold text-fg">What this release is</h2>
        <p>Accounts with a role. Creator, studio, buyer, investor, and staff desks. A title record. Manual QC, rights review, and curation. The public site is https://www.crayonspictures.in.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">What this release is not</h2>
        <p>It is not the consumer streaming site. That is Crayons Loop. It is not a cluttered file uploader. Master-file storage is Oracle Cloud Infrastructure, and it stays closed in this release until a simple upload is opened.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">Who it is for</h2>
        <p>Creators and studios submit title records. Staff review them. Buyers see only titles the workflow has cleared. Investors see records they are assigned.</p>
      </section>
      <p>
        Business enquiries:{" "}
        <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a>
        {" "}or the <Link to="/contact" className="font-semibold text-accent underline">contact page</Link>.
      </p>
    </PublicPage>
  );
}
