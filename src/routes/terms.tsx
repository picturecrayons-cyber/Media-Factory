import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">StreamVista OPC Pvt Ltd · Crayons Bridge</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">Platform Terms</h1>
          <p className="mt-3 text-sm text-muted">Effective publication: 23 November 2026</p>
        </header>
        <section className="space-y-4 text-sm leading-7 text-muted">
          <h2 className="font-semibold text-fg">1. Scope and acceptance</h2>
          <p>These terms govern access to Crayons Bridge and related business services operated by StreamVista OPC Pvt Ltd (the Company). By creating an account or using the service, you agree to these terms and applicable transaction-specific agreements. If you act for an organization, you confirm authority to bind it.</p>
          <h2 className="font-semibold text-fg">2. Account security and eligibility</h2>
          <p>You must provide accurate information, protect your credentials and promptly report suspected unauthorized access. Access is role-based and may require verification or invitation. Buyer and Investor access may be restricted to approved or invited accounts. The Company may suspend access for security, legal compliance or material breach.</p>
          <h2 className="font-semibold text-fg">3. IP sovereignty and chain of title</h2>
          <p>Creators and Studios retain ownership of content they own. Each submitting party represents that it has the authority and necessary rights to submit the content and grant the permissions expressly selected or agreed in writing. Users must provide accurate chain-of-title, music, performer, archive, territory and other supporting evidence when requested. A submission or upload does not constitute verification, QC approval, rights clearance, publication or acceptance by the Company.</p>
          <h2 className="font-semibold text-fg">4. Bridge authorization and Loop delivery</h2>
          <p>Crayons Bridge is the business platform for title records, rights evidence, licensing and distribution authorization. Crayons Loop is a separate consumer streaming experience. A title may be made available on Crayons Loop only after the applicable technical QC, rights and ownership checks, legal review and explicit publication authorization are completed. Buyer listing status does not automatically authorize consumer publication.</p>
          <h2 className="font-semibold text-fg">5. Licence scope and strict non-sublicensing</h2>
          <p>Every licence is limited by its written grant, including permitted use, media, platform, territory, language, term, exclusivity, delivery method and any other stated restriction. Unless a separate written agreement expressly approved by the rights holder and Company states otherwise, all sublicences are strictly Non-Sublicensable and Non-Transferable. The licensee has “No Right to Deliver to Next Person” and must not assign, sublicense, resell, share or pass access or materials to another person or entity. No broader rights are implied.</p>
          <h2 className="font-semibold text-fg">6. Buyer screeners and deliveries</h2>
          <p>Screeners, previews and delivery links are confidential, limited-purpose and may be watermarked, time-bound or restricted to named recipients. Users must not record, redistribute, download or disclose them except as expressly authorized in writing. Access can be revoked if authorization expires or is withdrawn.</p>
          <h2 className="font-semibold text-fg">7. Payments and revenue</h2>
          <p>Fees, taxes, commissions, revenue shares and settlement conditions are governed by the relevant order, licence or signed agreement. Payment-provider confirmation is required before an order is treated as paid. No investment, return, financing or payout is promised merely by account access, title listing or dashboard display.</p>
          <h2 className="font-semibold text-fg">8. User conduct and compliance</h2>
          <p>You must not upload unlawful or infringing material, misrepresent ownership, evade access controls, interfere with systems, misuse personal data or use the service to violate another person's rights. Users must respond promptly to rights and compliance enquiries and preserve relevant evidence.</p>
          <h2 className="font-semibold text-fg">9. Copyright and takedowns</h2>
          <p>Copyright complaints are handled under the Company's copyright and DMCA-style notice procedure described on the <Link to="/dmca" className="font-semibold text-accent underline">Copyright & DMCA Policy</Link>. The Company may restrict access or place content on hold while a good-faith complaint is reviewed. A hold is not a final finding of infringement.</p>
          <h2 className="font-semibold text-fg">10. Third-party services</h2>
          <p>The platform may integrate with hosting, storage, authentication, communications and payment providers. Those services are subject to their own terms. Users remain responsible for complying with applicable provider and platform requirements.</p>
          <h2 className="font-semibold text-fg">11. Availability, suspension and liability</h2>
          <p>The service is provided on an as-available basis. The Company does not guarantee uninterrupted access, a buyer offer, a licence or distribution outcome. Nothing excludes liability or statutory rights that cannot lawfully be excluded. The Company may suspend or terminate access for material breach, unlawful activity, security risks or legal requirement.</p>
          <h2 className="font-semibold text-fg">12. Governing law and jurisdiction</h2>
          <p>These terms are governed by the laws of India. Subject to mandatory law, courts having jurisdiction in Ernakulam, Kerala shall have jurisdiction over disputes.</p>
          <h2 className="font-semibold text-fg">13. Contact</h2>
          <p>For questions about these terms, use the <Link to="/contact" className="font-semibold text-accent underline">Contact page</Link> or email <a className="font-semibold text-accent underline" href="mailto:abijithasokan@crayonspictures.com">abijithasokan@crayonspictures.com</a>.</p>
        </section>
        <p className="border-t border-line pt-5 text-xs text-muted">These platform terms are a draft for operational publication and require review by Indian legal counsel before final adoption.</p>
      </article>
    </main>
  );
}
