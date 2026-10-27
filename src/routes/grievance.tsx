import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/grievance")({ component: Grievance });

function Grievance() {
  return (
    <PublicPage
      title="Grievance"
      updated="26 October 2026"
      lede="Use this page for complaints about an account, a title, privacy, or content on Crayons Bridge."
    >
      <p>StreamVista OPC Pvt Ltd operates Crayons Bridge at www.crayonspictures.in.</p>
      <p>
        Grievance contact:{" "}
        <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a>.
      </p>
      <p>Include your name, the account email, the page or title, and what you want corrected. We aim to acknowledge a complete complaint within 24 hours and to respond within 15 days where the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 apply.</p>
      <p>Copyright claims should also follow the DMCA page so the notice has the required statements.</p>
    </PublicPage>
  );
}
