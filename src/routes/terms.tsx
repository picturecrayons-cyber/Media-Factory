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
              suspected unauthorized access. You must keep your account,
              organization, ownership, contact, and payment details accurate
              and promptly correct material changes.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">3. User-submitted content and uploader responsibility</h2>
            <p>
              The person or organization that uploads, submits, imports, lists,
              or otherwise supplies any film, video, audio, image, artwork,
              subtitle, script, document, metadata, personal information, or
              other material ("Submitted Content") is responsible for that
              Submitted Content and for the accuracy and completeness of all
              information supplied with it. This responsibility applies whether
              the upload is made by the rights holder, a creator, a studio, an
              employee, an agent, or another authorized account user.
            </p>
            <p>
              Before submitting content, you must own it or have all necessary
              authority, licences, permissions, consents, releases, and other
              legal rights to upload it to Crayons Bridge and to authorize the
              processing, storage, technical review, preview, controlled
              sharing, and other uses you request through the service. You are
              responsible for obtaining and maintaining applicable copyright,
              performer, music, soundtrack, artwork, script, location, privacy,
              publicity, personal-data, and other clearances, including any
              territory, language, term, media, and platform restrictions.
            </p>
            <p>
              You must not upload or submit content that you know, or ought
              reasonably to know, is infringing, unauthorized, misleading,
              unlawful, malicious, privacy-violating, or subject to a
              conflicting assignment or restriction. You must disclose known
              claims, liens, encumbrances, prior licences, exclusivity,
              restrictions, and excluded rights relevant to the content.
            </p>
            <p>
              By submitting content, you grant StreamVista OPC Pvt Ltd a
              limited, non-exclusive, non-transferable (except to service
              providers acting for the service), royalty-free permission to
              host, store, reproduce as technically necessary, transcode,
              generate technical previews, perform quality-control checks,
              secure, and display the content within Crayons Bridge solely to
              operate, secure, support, and provide the features you request.
              This permission does not transfer ownership and does not itself
              authorize public release, commercial exploitation, sale, or
              licensing to a buyer. Any broader use requires separate,
              documented authority from the relevant rights holder.
            </p>
            <p>
              You are responsible for the content and actions of people using
              your account or workspace, to the extent permitted by applicable
              law. Do not share credentials; use individual accounts and
              promptly remove access for people who are no longer authorized.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">4. Rights review, verification, and licensing</h2>
            <p>
              Crayons Bridge provides workflow and record-management tools. A
              user-submitted statement, account role, creator profile, upload,
              filename, metadata entry, or platform status is not by itself
              proof of copyright ownership, chain of title, or authority to
              license or distribute a title. We may request supporting
              documents, conduct checks, restrict access, or keep a title
              blocked while rights or identity questions remain unresolved.
            </p>
            <p>
              Users must cooperate with reasonable verification requests and
              promptly notify us of disputes, conflicting claims, revoked
              authority, or material errors. We do not guarantee that every
              submitted claim or document will be independently authenticated,
              and users must not treat a workflow status as legal clearance
              unless a separate written confirmation expressly says so.
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
            <h2 className="font-semibold text-fg">5. Orders, fees, and payments</h2>
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
            <h2 className="font-semibold text-fg">6. Complaints, takedown, and content restrictions</h2>
            <p>
              If you believe content on the service infringes your rights,
              contains unauthorized material, violates privacy, or is
              otherwise unlawful, please notify us through the Contact page
              with the title or asset reference, the specific material at
              issue, your basis for the complaint, and supporting information.
              Do not submit false or knowingly misleading complaints.
            </p>
            <p>
              We may, where reasonably necessary and subject to applicable law,
              restrict access to, disable previews of, quarantine, or remove
              Submitted Content; suspend related workflows; preserve relevant
              records; and request further evidence from the uploader or
              claimant. We may restore restricted content if a complaint is
              withdrawn, resolved, or shown to be unfounded. These steps do not
              determine legal ownership or replace a court or competent
              authority.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">7. Acceptable use and service availability</h2>
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
            <h2 className="font-semibold text-fg">8. Intellectual property and responsibility for claims</h2>
            <p>
              The platform, its software, branding, and service materials are
              owned by or licensed to their respective rights holders. Except
              for the limited access needed to use the service, no ownership or
              other rights are granted to you in those materials. You retain
              rights in your Submitted Content, subject to the limited service
              permission described in these Terms and any separate agreement
              you accept.
            </p>
            <p>
              To the extent permitted by applicable law, you are responsible
              for losses, claims, liabilities, and reasonable costs arising
              from your breach of these Terms, your unauthorized submission or
              use of content, or your material misrepresentation of ownership
              or authority. This does not make you responsible for matters
              caused by our own breach, negligence, or unlawful conduct, and
              does not exclude rights or remedies that cannot legally be
              excluded.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">9. Third-party services</h2>
            <p>
              The service may link to or rely on third-party tools, payment
              providers, or storage services. Their services are subject to
              their own terms and availability; we are not responsible for
              independent third-party services to the extent permitted by law.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">10. Suspension and termination</h2>
            <p>
              You may stop using the service at any time. We may suspend or
              terminate access for a material breach of these Terms, unlawful
              activity, security risks, or where required by law or an applicable
              agreement. Any surviving payment obligations, rights restrictions,
              and provisions that by their nature continue will remain effective.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">11. Liability</h2>
            <p>
              To the extent permitted by applicable law, the service is provided
              on an as-available basis, and we exclude warranties that cannot
              otherwise be implied or that may lawfully be excluded. Nothing in
              these Terms excludes liability or consumer rights that cannot
              legally be excluded or limited.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-fg">12. Privacy and updates</h2>
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
            <h2 className="font-semibold text-fg">13. Contact</h2>
            <p>
              For questions about these Terms, payments, content complaints,
              or the service, use the{" "}
              <Link to="/contact" className="font-semibold text-accent underline">
                Contact page
              </Link>
              . Specific transactions or licensing arrangements may also be
              governed by separate written agreements.
            </p>
          </div>
        </section>

        <p className="border-t border-line pt-5 text-xs text-muted">
          Last updated: 18 November 2026.
        </p>
      </article>
    </main>
  );
}
