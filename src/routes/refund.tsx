import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_CONTACT, PublicPage } from "@/components/bridge/public-page";

export const Route = createFileRoute("/refund")({ component: Refund });

function Refund() {
  return (
    <PublicPage
      title="Refunds and cancellations"
      updated="26 October 2026"
      lede="This policy applies when Crayons Bridge charges a fee. A separate written deal controls that deal."
    >
      <p>If a fee is shown before you pay, that amount, currency, and tax are the charge. Payments, when offered, are processed by the payment provider named at checkout.</p>
      <p>A completed licence or rights authorization is not refundable unless the written agreement for that title says it is, or the law requires a refund.</p>
      <p>If a payment is captured and the service you paid for is not opened because of our failure, write to us and we will either complete the service or refund the captured amount that is still unused.</p>
      <p>
        Cancellation and refund requests:{" "}
        <a className="font-semibold text-accent underline" href={`mailto:${PUBLIC_CONTACT}`}>{PUBLIC_CONTACT}</a>.
      </p>
    </PublicPage>
  );
}
