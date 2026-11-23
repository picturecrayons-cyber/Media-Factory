import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): { inquiry?: string } => ({
    inquiry: typeof search.inquiry === "string" ? search.inquiry : undefined,
  }),
  component: Contact,
});

const CONTACT_EMAIL = "abijithasokan@crayonspictures.com";

function Contact() {
  const { inquiry } = Route.useSearch();
  const initialType = inquiry === "buyer" || inquiry === "investor" ? inquiry : "general";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState(initialType);
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = encodeURIComponent(`Crayons Bridge ${type} enquiry`);
    const body = encodeURIComponent([
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `Organization: ${organization || "Not provided"}`,
      `Inquiry type: ${type}`,
      "",
      message,
    ].join("\\n"));
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setDone(true);
  }

  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <section className="mx-auto max-w-2xl rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-accent">StreamVista OPC Pvt Ltd</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Contact Crayons Bridge</h1>
        <p className="mt-3 text-sm leading-7 text-muted">Send a business, access, support or copyright enquiry to the Crayons Bridge team.</p>
        <a className="mt-4 inline-block font-semibold text-accent underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        {done ? (
          <p role="status" className="mt-6 rounded-xl border border-line p-4 text-sm">Your email application should open with the enquiry details. Send the message there to complete delivery.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <label className="block text-sm font-medium">Inquiry type
              <select value={type} onChange={(event) => setType(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3">
                <option value="creator">Creator</option><option value="studio">Studio</option><option value="buyer">Buyer access</option><option value="investor">Investor access</option><option value="legal / DMCA">Legal & DMCA</option><option value="general">General</option>
              </select>
            </label>
            <label className="block text-sm font-medium">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3" /></label>
            <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3" /></label>
            <label className="block text-sm font-medium">Phone (optional)<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3" /></label>
            <label className="block text-sm font-medium">Organization / Platform (optional)<input value={organization} onChange={(event) => setOrganization(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3" /></label>
            <label className="block text-sm font-medium">Message<textarea required minLength={10} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} className="mt-1.5 w-full rounded-xl border border-line-strong bg-white p-3" /></label>
            <button type="submit" className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Prepare enquiry email</button>
          </form>
        )}
        <p className="mt-6 text-xs text-muted">Form submission opens your email application; the message is not stored by this website.</p>
      </section>
    </main>
  );
}
