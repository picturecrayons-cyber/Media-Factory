import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
  return (
    <PublicPage
      title="Contact"
      updated="26 October 2026"
      lede="StreamVista OPC Pvt Ltd operates Crayons Bridge. Use one address for business, privacy, copyright, and support."
    >
      <p>
        <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a>
      </p>
      <p>Public site: https://www.crayonspictures.in</p>
    </PublicPage>
  );
}
