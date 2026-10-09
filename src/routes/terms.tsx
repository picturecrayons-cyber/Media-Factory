import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">
          ← Crayons Bridge
        </Link>

        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            StreamVista OPC Pvt Ltd. · Crayons Bridge
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold">
            Terms &amp; Conditions
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            These Terms &amp; Conditions govern your access to and use of Crayons
            Bridge, including its content submission, media workflow, rights
            management, licensing, delivery, workspace, and related services.
          </p>
        </header>

        <section className="space-y-5 text-sm leading-7 text-muted">
          <div>
            <h2 className="font-semibold text-fg">1. About the service</h2>
            <p>
              Crayons Bridge is operated by StreamVista OPC Pvt Ltd. The service
              provides tools and workflows for managing media titles, assets,
              rights information, licensing discussions, and authorized
              delivery. Features may vary by account, plan, or written agreement.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">2. Accounts and accurate information</h2>
            <p>
              You must provide accurate, current information and keep your
              account credentials secure. You are responsible for activity
              carried out through your account and must promptly notify us of
              suspected unauthorized access.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">3. Content, rights, and permissions</h2>
            <p>
              You may submit or manage only content and materials that you own
              or are authorized to represent, store, process, or license. You
              are responsible for obtaining and maintaining the permissions,
              releases, music clearances, and other rights required for your
              intended use, and for ensuring that submitted information is
              accurate.
            </p>
            <p>
              Uploading, listing, previewing, or discussing a title on Crayons
              Bridge does not by itself transfer ownership or grant a buyer any
              licence. Any licence, sale, exclusivity, territory, term, or
              distribution right must be documented in the applicable written
              agreement and authorized by the relevant rights holder.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">4. Orders, fees, and payments</h2>
            <p>
              Where a paid service or transaction is offered, the applicable
              price, billing frequency, currency, and taxes will be shown before
              you confirm payment. You authorize the payment method you select
              to be charged for the amount presented at checkout. Payments may
              be processed by a third-party payment provider and are subject to
              that provider's applicable terms. An order or payment is treated
              as confirmed only when the service or payment provider confirms
              its status.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">5. Refunds and cancellations</h2>
            <p>
              Refund and cancellation requests are handled under the applicable
              Refund Policy and Cancellation Policy shown for the service or
              transaction, together with any specific written agreement and
              applicable law. Please review those policies before completing a
              purchase or subscription. Nothing in these Terms limits rights
              that cannot lawfully be excluded.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">6. Acceptable use and service availability</h2>
            <p>
              You must not use the service to infringe intellectual property,
              violate privacy or law, misrepresent ownership, bypass access
              controls, distribute content without authorization, or interfere
              with the service or other users. We may restrict or suspend access
              where reasonably necessary for security, suspected misuse, legal
              compliance, or protection of users and content.
            </p>
            <p>
              We aim to provide a reliable service but do not guarantee
              uninterrupted availability, error-free operation, or that a
              submitted title will receive a buyer, licence, or distribution
              offer.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">7. Intellectual property</h2>
            <p>
              The platform, its software, branding, and service materials are
              owned by or licensed to their respective rights holders. Except
              for the limited access needed to use the service, no ownership or
              other rights are granted to you in those materials. You retain
              rights in your content, subject to the permissions needed to
              provide the service and any separate agreement you accept.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">8. Third-party services</h2>
            <p>
              The service may link to or rely on third-party tools, payment
              providers, or storage services. Their services are subject to
              their own terms and availability; we are not responsible for
              independent third-party services to the extent permitted by law.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">9. Suspension and termination</h2>
            <p>
              You may stop using the service at any time. We may suspend or
              terminate access for a material breach of these Terms, unlawful
              activity, security risks, or where required by law or an applicable
              agreement. Any surviving payment obligations, rights restrictions,
              and provisions that by their nature continue will remain effective.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">10. Liability</h2>
            <p>
              To the extent permitted by applicable law, the service is provided
              on an as-available basis, and we exclude warranties that cannot
              otherwise be implied or that may lawfully be excluded. Nothing in
              these Terms excludes liability or consumer rights that cannot
              legally be excluded or limited.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">11. Privacy and updates</h2>
            <p>
              Our handling of personal information is described in the{" "}
              <Link to="/privacy" className="font-semibold text-accent underline">
                Privacy Policy
              </Link>
              . We may update these Terms from time to time by publishing a
              revised version on this page. The updated date below indicates
              when this page was last revised.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">12. Contact</h2>
            <p>
              For questions about these Terms, payments, or the service, use the{" "}
              <Link to="/contact" className="font-semibold text-accent underline">
                Contact page
              </Link>
              . Specific transactions or licensing arrangements may also be
              governed by separate written agreements.
            </p>
          </div>
        </section>

        <p className="border-t border-line pt-5 text-xs text-muted">
          Last updated: 9 October 2026.
        </p>
      </article>
    </main>
  );
}
