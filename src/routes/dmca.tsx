import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/dmca")({ component: CopyrightPolicy });

const CONTACT = "abijithasokan@crayonspictures.com";

function CopyrightPolicy() {
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [work,setWork]=useState("");
  const [location,setLocation]=useState("");
  const [details,setDetails]=useState("");
  const [goodFaith,setGoodFaith]=useState(false);
  const [authority,setAuthority]=useState(false);
  const [prepared,setPrepared]=useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject=encodeURIComponent("Copyright notice / counter-notice enquiry");
    const body=encodeURIComponent([
      `Name: ${name}`,`Email: ${email}`,`Work: ${work}`,`Location: ${location}`,
      `Good-faith statement confirmed: ${goodFaith}`,`Authority and accuracy confirmed: ${authority}`,"",details
    ].join("\\n"));
    window.location.href=`mailto:${CONTACT}?subject=${subject}&body=${body}`;
    setPrepared(true);
  }

  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-3xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">StreamVista OPC Pvt Ltd · Copyright & Compliance</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">Copyright & DMCA-Style Policy</h1>
          <p className="mt-3 text-sm text-muted">Published 23 November 2026</p>
        </header>
        <section className="space-y-4 text-sm leading-7 text-muted">
          <p>The Company respects copyright and related rights. This policy provides a channel for rights holders and authorized representatives to report content they believe is being used or made available without authorization. It is a complaint-handling policy; the United States DMCA does not necessarily govern every use of this India-operated service.</p>
          <h2 className="font-semibold text-fg">Notice requirements</h2>
          <p>Identify the copyrighted work, the material reported and its exact location, your contact details, your relationship to the rights holder, and why you believe the use is unauthorized. Include a good-faith statement and confirm that the information is accurate and that you are authorized to act.</p>
          <h2 className="font-semibold text-fg">Review and temporary restrictions</h2>
          <p>The Company may acknowledge a sufficiently detailed notice, request clarification, restrict access to the reported material, or place the relevant title or asset on temporary legal hold while an authorized reviewer examines the matter. A temporary hold is not a final finding of infringement. Marketplace and Crayons Loop restrictions require authorized action under the Company's internal process; this email form does not automatically unpublish content.</p>
          <h2 className="font-semibold text-fg">Counter-notice</h2>
          <p>A person whose material is restricted may respond with identifying information, the location of the material, reasons the restriction may be mistaken, contact details and confirmation of authority and accuracy. The Company will consider the response, applicable law and any direction of a competent authority. Restoration is not automatic.</p>
          <h2 className="font-semibold text-fg">Evidence and contact</h2>
          <p>Notices, responses and decisions may be retained as restricted legal evidence for compliance and dispute resolution. Send notices and counter-notices to <a className="font-semibold text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> with “Copyright Notice” or “Counter-Notice” in the subject.</p>
        </section>
        <section className="border-t border-line pt-6">
          <h2 className="font-semibold text-fg">Prepare a notice by email</h2>
          {prepared ? <p role="status" className="mt-3 text-sm text-muted">Your email application should open with the details. Send the email to deliver the notice; this website does not store or submit it to a case-management system.</p> : (
            <form onSubmit={submit} className="mt-4 space-y-4 text-sm">
              <label className="block">Full name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line-strong bg-white px-3"/></label>
              <label className="block">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line-strong bg-white px-3"/></label>
              <label className="block">Copyrighted work<input required value={work} onChange={e=>setWork(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line-strong bg-white px-3"/></label>
              <label className="block">Reported material location / title reference<input required value={location} onChange={e=>setLocation(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line-strong bg-white px-3"/></label>
              <label className="block">Details and basis of complaint<textarea required minLength={30} rows={5} value={details} onChange={e=>setDetails(e.target.value)} className="mt-1 block w-full rounded-xl border border-line-strong bg-white p-3"/></label>
              <label className="flex gap-2"><input required type="checkbox" checked={goodFaith} onChange={e=>setGoodFaith(e.target.checked)}/> I believe in good faith that the reported use is not authorized.</label>
              <label className="flex gap-2"><input required type="checkbox" checked={authority} onChange={e=>setAuthority(e.target.checked)}/> I confirm the information is accurate and I am authorized to submit this notice.</label>
              <button className="rounded-full bg-accent px-6 py-3 font-semibold text-[#041018]" type="submit">Prepare email notice</button>
            </form>
          )}
          <p className="mt-4 text-xs text-muted">This form opens your email application. It does not create a case, place a legal hold or change title publication state. Those actions require a verified internal workflow.</p>
        </section>
        <p className="border-t border-line pt-5 text-xs text-muted">This policy requires review by Indian copyright counsel before final legal adoption.</p>
      </article>
    </main>
  );
}
