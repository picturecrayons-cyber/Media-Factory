import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-fg">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-surface p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Crayons Bridge</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm leading-7 text-muted">The page may have moved or the address may be incorrect.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Return to Home</Link>
      </section>
    </main>
  );
}
