import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-fg">
      <section className="w-full max-w-2xl rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <h1 className="mt-6 font-display text-4xl font-semibold">Contact</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">For Crayons Bridge business, workspace, licensing, or support enquiries, contact StreamVista OPC Pvt Ltd.</p>
        <a href="mailto:contact@streamvista.com" className="mt-7 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#041018]">contact@streamvista.com</a>
      </section>
    </main>
  );
}
