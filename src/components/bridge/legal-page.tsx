import { Link } from "@tanstack/react-router";

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type LegalDocument = { title: string; summary: string; version: string; effective: string; sections: LegalSection[] };

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  "b2b-terms": {
    title: "B2B Terms of Use",
    summary: "Terms governing business accounts and use of the Crayons Bridge platform.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "Operator and scope", paragraphs: ["Crayons Bridge is operated by StreamVista OPC Pvt Ltd (the “Company”). It is a business-to-business workspace for title intake, production coordination, rights evidence, licensing discussions, buyer access and authorized delivery. These terms apply to account holders and their permitted organization members."] },
      { heading: "Accounts and authority", paragraphs: ["You must provide accurate information, use an individual account, protect your credentials and promptly report suspected compromise. An organization administrator may manage organization membership but does not automatically receive or transfer another member’s individual title grants.", "Access is determined by the account role, organization membership, title-level authorization and applicable agreement. A login, invitation, payment or organization association does not itself grant title ownership, rights approval, buyer access, QC sign-off or publication authority."] },
      { heading: "Platform workflow and decisions", paragraphs: ["Creating a title, uploading a file, submitting evidence, viewing a screener or sending an enquiry does not constitute acceptance, legal clearance, a licence or a distribution commitment. The Company may require separate technical, rights, legal, commercial and delivery approvals.", "Crayons Bridge authorization for a destination is separate from that destination’s publication and consumer playback entitlements. Crayons Loop is one destination and is not the only buyer or distribution channel."] },
      { heading: "Fees and third-party services", paragraphs: ["Any applicable fee, quote, tax, currency, scope and payment terms will be disclosed before an order is accepted. Payment does not certify a title, approve rights, sign off a deliverable or guarantee a commercial outcome. Third-party payment, hosting and storage services may be subject to their own terms."] },
      { heading: "Confidentiality and permitted use", paragraphs: ["Non-public titles, screeners, deal terms, documents and business information must be treated as confidential and used only for the authorized business purpose. You must not copy, redistribute, reverse engineer, scrape, bypass access controls or disclose another party’s material without permission."] },
      { heading: "Suspension, termination and liability", paragraphs: ["The Company may restrict or suspend access where reasonably necessary to protect accounts, content, users, legal compliance or platform security. You may stop using the service; records may be retained where required for contracts, security, dispute resolution or law.", "To the extent permitted by applicable law, the service is provided subject to its documented availability and limitations. Nothing in these terms excludes liability or rights that cannot lawfully be excluded. Any specific commercial allocation of risk must be set out in a separately executed agreement."] },
      { heading: "Governing law and changes", paragraphs: ["These terms are intended for use in India and are subject to applicable Indian law. The appropriate courts, dispute forum and final governing-law wording must be confirmed by the Company’s legal adviser before publication. Material changes will be versioned and presented for acknowledgement where required."] },
    ],
  },
  "content-rights": {
    title: "Content Submission & Rights Declaration",
    summary: "Responsibilities for submitting titles, artwork, footage, documents and rights evidence.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "Authority to submit", paragraphs: ["You may submit content only if you own it or are duly authorized by the relevant owner or representative. You are responsible for the accuracy and completeness of title metadata, contributor details and rights information."] },
      { heading: "Rights and clearances", paragraphs: ["Before requesting licensing or distribution, identify the relevant chain of title and obtain applicable author, performer, producer, music, artwork, location, archive, privacy and other permissions. State any restrictions, encumbrances, prior grants, exclusivity, territory, language, media, term and holdbacks accurately.", "A declaration or uploaded document is evidence for review; it is not an approval or legal opinion by Crayons Bridge. Rights status remains pending until an authorized reviewer records a decision."] },
      { heading: "Permitted processing", paragraphs: ["You grant the Company a limited, non-exclusive permission to host, process, secure, review and display submitted material to the extent necessary to operate the requested Bridge workflow and any separately authorized delivery. This permission does not transfer ownership and ends subject to applicable retention, contractual and legal requirements."] },
      { heading: "Accuracy, claims and indemnity", paragraphs: ["Notify the Company promptly if ownership, authority or clearance information changes or a claim is received. Do not knowingly submit infringing, misleading, unlawful or malicious material. Any final warranties, indemnities and liability allocation must be set out in the applicable signed agreement and reviewed by counsel."] },
      { heading: "Review and retention", paragraphs: ["The Company may request additional evidence, restrict access or pause a workflow while a rights question is reviewed. Records may be retained for audit, security, contractual, dispute-resolution and legal purposes in accordance with the applicable retention schedule."] },
    ],
  },
  "licensing-deals": {
    title: "Licensing & Deal Terms",
    summary: "Rules for buyer enquiries, title access, negotiations, offers and executed licences.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "Enquiries are not offers", paragraphs: ["A marketplace listing, enquiry, request for access, screener invitation or discussion is not an offer, acceptance, option, licence or promise to transact. Commercial terms become binding only when documented in an agreement executed by parties with authority."] },
      { heading: "Scope of a licence", paragraphs: ["A licence should expressly identify the title and version, rights granted, media, territory, language, exclusivity, term, start and end dates, permitted platforms, sublicensing, marketing rights, delivery specifications, fees, taxes, reporting, payment milestones and any holdbacks or restrictions."] },
      { heading: "Buyer access and confidentiality", paragraphs: ["Buyer access is granted to named individual accounts and may be limited by title, asset type, purpose and expiry. Organization membership does not automatically extend a grant to other members. Screeners and preview files may not be downloaded, copied, recorded, shared or used outside the approved purpose."] },
      { heading: "Payments and delivery", paragraphs: ["Payment confirmation, rights approval, delivery acceptance and consumer playback entitlement are separate events. A payment receipt does not replace an executed licence or delivery sign-off. Any refund, cancellation, revenue share or tax treatment must be specified in the applicable order or agreement."] },
      { heading: "Conflicts and precedence", paragraphs: ["If a signed title-specific agreement conflicts with this general policy, the signed agreement governs that transaction to the extent of the conflict, subject to applicable law."] },
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use & Security Policy",
    summary: "Minimum security and conduct rules for every Bridge account and organization.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "Account security", paragraphs: ["Use your own account, keep authentication factors private, use strong unique credentials and report suspected compromise immediately. Do not share accounts or impersonate another user."] },
      { heading: "Prohibited activity", bullets: ["Attempting unauthorized access, privilege escalation or security testing without written permission.", "Copying, recording, scraping, redistributing or reverse engineering private screeners, masters, documents or deal information.", "Uploading malware, unlawful content, deceptive metadata or material without authority.", "Circumventing title grants, expiry, revocation, download controls, payment verification or audit controls.", "Interfering with platform availability, other users’ workspaces or integrity of records."] },
      { heading: "Monitoring and response", paragraphs: ["The Company may record security and operational events, investigate suspected misuse, preserve relevant evidence and restrict access where reasonably necessary. Access restrictions and incident handling should be proportionate and documented."] },
      { heading: "Responsible disclosure", paragraphs: ["Report a suspected vulnerability or security incident through the Company contact route. Do not access, alter, copy or disclose other users’ data while investigating."] },
    ],
  },
  "copyright-disputes": {
    title: "Copyright & Content Disputes",
    summary: "A business-facing process for ownership objections and rights disputes relating to Bridge submissions.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "What to submit", paragraphs: ["A rights or copyright complaint should identify the claimant, the work, the relevant Bridge title or asset, the claimant’s basis of authority, the specific disputed material, the nature of the alleged infringement and supporting documents. Include a reliable reply contact and a good-faith declaration."] },
      { heading: "Review process", paragraphs: ["The Company may acknowledge the complaint, request clarification, notify relevant account holders where appropriate, preserve records and refer the matter for legal review. Temporary access restrictions may be considered where reasonably necessary; a complaint alone does not automatically establish infringement or transfer ownership."] },
      { heading: "Response and resolution", paragraphs: ["Affected parties may provide a reasoned response and supporting evidence. The Company will assess the available information and may maintain, restrict, restore or remove access in accordance with the evidence, applicable agreement and law. Material decisions should be recorded with an audit trail."] },
      { heading: "No substitute for statutory process", paragraphs: ["This B2B workflow does not replace any notice, counter-notice, court process or statutory remedy available under Indian law. It is not the public-facing takedown procedure for Crayons Loop."] },
    ],
  },
  "dmca": {
    title: "DMCA, Copyright Notice & Takedown",
    summary: "How to submit copyright notices, counter-responses and urgent content-access complaints concerning Bridge materials.",
    version: "1.0 — draft for legal review",
    effective: "Publication date to be confirmed",
    sections: [
      { heading: "Scope and legal framework", paragraphs: ["This page provides a contact and review process for copyright and content complaints relating to Crayons Bridge, a business-to-business content workflow. The United States DMCA (17 U.S.C. § 512) applies only where legally relevant; this page does not claim that every Bridge user or transaction is governed by US law. Indian copyright law and other applicable laws remain relevant according to the facts and jurisdiction. This page is not legal advice and does not replace a statutory notice, court order or rights-holder agreement."] },
      { heading: "Submitting a notice", bullets: ["Identify the copyrighted work and the claimant or authorized representative.", "Identify the specific Bridge title, asset, file reference or location and describe the material complained of.", "Explain the ownership or authorization basis and why the use is alleged to be unauthorized.", "Provide reliable contact details, supporting evidence and a good-faith statement.", "Where a formal statutory notice is intended, include the declarations and particulars required by the applicable law and jurisdiction."] },
      { heading: "Counter-response", paragraphs: ["An affected uploader or account holder may send a reasoned response identifying the material, explaining the basis for its submission or authorization, and attaching relevant licences, assignments or other evidence. A counter-response does not automatically restore access or determine legal ownership."] },
      { heading: "Review, restriction and restoration", paragraphs: ["The Company may acknowledge a complaint, seek clarification, preserve relevant records, notify affected parties where appropriate and refer the matter for legal review. Temporary restriction, continued restriction or restoration will be considered against the evidence, applicable agreement, platform security and law. Decisions should be recorded with an audit trail. A complaint alone is not proof of infringement."] },
      { heading: "Where to send notices", paragraphs: ["Send Bridge copyright and takedown correspondence to abijithasokan@crayonspictures.com with the subject “Crayons Bridge — Copyright / DMCA Notice”. Do not send passwords, one-time codes or payment-card information. This contact route and the Company's designated legal representative must be confirmed before publication."] },
      { heading: "Crayons Loop is separate", paragraphs: ["This page covers the Bridge B2B workspace only. It is not the consumer-facing Crayons Loop notice-and-takedown process. Loop-specific reporting, statutory contact details and response procedures must be published on Crayons Loop separately."] },
    ],
  },
  "grievance": {
    title: "Grievance & Legal Contact",
    summary: "How to route privacy, account, rights, licensing and legal notices to the Company.",
    version: "1.0 — draft for legal review", effective: "Publication date to be confirmed",
    sections: [
      { heading: "Contact route", paragraphs: ["For business, account, licensing and general legal correspondence, contact abijithasokan@crayonspictures.com with “Crayons Bridge — Legal / Grievance” in the subject. For privacy-related questions, the existing privacy contact shown in the Privacy Policy may also be used."] },
      { heading: "Information to include", bullets: ["Your full name and organization, if applicable.", "The account email and relevant title, asset or transaction reference.", "A clear description of the request, complaint or dispute.", "Supporting evidence and the outcome you are seeking. Do not email passwords, authentication codes or payment-card details."] },
      { heading: "Acknowledgement and escalation", paragraphs: ["The Company will route the request to an appropriate reviewer and respond as reasonably practicable, subject to verification, complexity and applicable statutory timelines. Formal statutory timelines and the designated Grievance Officer / Data Protection Officer details must be confirmed and published by the Company before this page is treated as a legally complete notice."] },
      { heading: "Privacy requests", paragraphs: ["Requests to access, correct, erase or otherwise exercise applicable data rights will be handled subject to identity verification, legal retention duties and the provisions in force under applicable Indian data-protection law."] },
    ],
  },
};

export function LegalPage({ document }: { document: LegalDocument }) {
  return <main className="min-h-screen bg-white px-5 py-10 text-fg sm:px-6">
    <article className="mx-auto max-w-4xl rounded-3xl border border-line bg-surface p-6 sm:p-10">
      <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-muted">StreamVista OPC Pvt Ltd · B2B legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{document.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{document.summary}</p>
      <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted"><span>Version: {document.version}</span><span>Effective: {document.effective}</span></div>
      <div className="mt-8 space-y-7">{document.sections.map((section) => <section key={section.heading} className="space-y-3">
        <h2 className="font-semibold text-fg">{section.heading}</h2>
        {section.paragraphs?.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-muted">{paragraph}</p>)}
        {section.bullets ? <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      </section>)}</div>
      <nav aria-label="Other legal documents" className="mt-10 flex flex-wrap gap-x-5 gap-y-3 border-t border-line pt-5 text-sm">
        <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>
        <Link to="/terms" className="text-accent hover:underline">B2B Terms</Link>
        <Link to="/legal" className="text-accent hover:underline">Legal Centre</Link>
        <Link to="/contact" className="text-accent hover:underline">Contact</Link>
      </nav>
      <p className="mt-6 text-xs leading-6 text-muted">Draft policy text for operational use; final legal wording, statutory designations, addresses, retention periods and effective dates require review and approval by the Company’s legal adviser. No page is represented as legally certified.</p>
    </article>
  </main>;
}
