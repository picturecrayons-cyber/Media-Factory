import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/dmca")({ component: Dmca });

function Dmca() {
  return (
    <PublicPage
      title="Copyright and DMCA"
      updated="26 October 2026"
      lede="Crayons Bridge respects copyright. This page is the public notice and takedown process for www.crayonspictures.in."
    >
      <section>
        <h2 className="font-semibold text-fg">Send a notice</h2>
        <p>
          Email <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a> with
          the subject “Copyright notice”.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name, email, and phone.</li>
          <li>The work you own or are authorized to act for.</li>
          <li>The exact page or title on Crayons Bridge.</li>
          <li>A statement that you have a good-faith belief the use is not authorized.</li>
          <li>A statement that the notice is accurate and that you are the rights owner or an authorized agent.</li>
          <li>Your physical or electronic signature.</li>
        </ul>
      </section>
      <section>
        <h2 className="font-semibold text-fg">What we do</h2>
        <p>We review complete notices and may remove or restrict the title while the claim is checked. We may send the notice to the account that submitted the title. Repeat infringement can close an account.</p>
        <p>A notice is not a licence, a legal opinion, or a promise that a title will be removed before review.</p>
      </section>
    </PublicPage>
  );
}
