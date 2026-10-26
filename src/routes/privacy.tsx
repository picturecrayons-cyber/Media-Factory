import { createFileRoute, Link } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <PublicPage
      title="Privacy"
      updated="26 October 2026"
      lede="This policy explains what Crayons Bridge collects on www.crayonspictures.in and how StreamVista OPC Pvt Ltd uses it."
    >
      <section>
        <h2 className="font-semibold text-fg">What we collect</h2>
        <p>Account data: name, email, role, and sign-in records.</p>
        <p>Workspace data: title records, rights notes, QC decisions, and audit events you or your team create.</p>
        <p>Technical data: browser, device, and security logs needed to keep the service available.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">Why we use it</h2>
        <p>To create your account, apply role permissions, run the title workflow, investigate abuse, and answer support requests. We do not sell personal information.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">Where it is kept</h2>
        <p>Accounts and title records are stored in our application database. Authentication is handled by Supabase. When file storage is enabled for a title, media files are stored in Oracle Cloud Infrastructure object storage. This public release does not require a master file.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">Sharing</h2>
        <p>We share data with the infrastructure providers needed to run the service, and when a law, order, or rights complaint requires it. Buyers see only titles that the workflow has cleared for them.</p>
      </section>
      <section>
        <h2 className="font-semibold text-fg">Your requests</h2>
        <p>
          For access, correction, or deletion requests, email{" "}
          <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a>.
          See also the <Link to="/grievance" className="font-semibold text-accent underline">grievance</Link> page.
        </p>
      </section>
    </PublicPage>
  );
}
