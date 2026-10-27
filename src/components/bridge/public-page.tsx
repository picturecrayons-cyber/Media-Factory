import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const PUBLIC_CONTACT = "abijithasokan@crayonspictures.com";

export function PublicPage({
  title,
  lede,
  updated,
  children,
}: {
  title: string;
  lede: string;
  updated: string;
  children: ReactNode;
}) {
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
          <h1 className="mt-2 font-display text-4xl font-semibold">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-muted">{lede}</p>
        </header>
        <nav aria-label="Legal and business" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <Link to="/privacy" className="font-semibold text-accent hover:underline">Privacy</Link>
          <Link to="/terms" className="font-semibold text-accent hover:underline">Terms</Link>
          <Link to="/dmca" className="font-semibold text-accent hover:underline">DMCA</Link>
          <Link to="/disclaimer" className="font-semibold text-accent hover:underline">Disclaimer</Link>
          <Link to="/refund" className="font-semibold text-accent hover:underline">Refunds</Link>
          <Link to="/grievance" className="font-semibold text-accent hover:underline">Grievance</Link>
          <Link to="/business" className="font-semibold text-accent hover:underline">Business</Link>
          <Link to="/contact" className="font-semibold text-accent hover:underline">Contact</Link>
        </nav>
        <div className="space-y-5 text-sm leading-7 text-muted">{children}</div>
        <p className="border-t border-line pt-5 text-xs text-muted">Last updated: {updated}.</p>
      </article>
    </main>
  );
}
