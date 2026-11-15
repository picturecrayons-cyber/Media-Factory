import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/contact")({ component: Contact });

const CONTACT_EMAIL = "abijithasokan@crayonspictures.com";

function Contact() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-fg">
      <section className="w-full max-w-2xl rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">
          ← Crayons Bridge
        </Link>

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          StreamVista OPC Pvt Ltd
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Contact Crayons Bridge</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          For business, production workspace, licensing, distribution, or support enquiries,
          contact the Crayons Bridge team by email.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-elevated p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Contact email
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Crayons%20Bridge%20Enquiry`}
            className="mt-2 inline-flex break-all text-base font-semibold text-accent underline-offset-4 hover:underline sm:text-lg"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your email app will open with a Crayons Bridge enquiry subject.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Crayons%20Bridge%20Enquiry`}
            className="mt-5 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#041018] transition-opacity hover:opacity-90"
          >
            Email Crayons Bridge
          </a>
        </div>
      </section>
    </main>
  );
}
