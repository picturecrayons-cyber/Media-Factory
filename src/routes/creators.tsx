import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/creators")({ component: Creators });

function Creators() {
  return (
    <main className="min-h-screen bg-white px-5 py-12 text-fg sm:px-6">
      <article className="mx-auto max-w-4xl space-y-7 rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-accent">← Crayons Bridge</Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Built for independent creators</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Your films. Your rights. Your route to market.</h1>
        <p className="max-w-2xl text-base leading-7 text-muted">Manage finished-film submissions, supporting assets, ownership evidence, technical review and authorized licensing in one secure workspace.</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          ["01","Submit","Create a finished-film title record with metadata and credits."],
          ["02","Prepare","Upload masters and supporting materials to the title workspace."],
          ["03","Technical QC","Track technical review and respond to requested corrections."],
          ["04","Rights verification","Provide chain-of-title and supporting legal evidence for review."],
          ["05","Licensing","Review buyer enquiries and title-specific licence terms."],
          ["06","Revenue tracking","Follow recorded licensing and settlement information where enabled."]
        ].map(([n,t,d])=><li key={n} className="rounded-2xl border border-line p-5"><span className="text-xs font-semibold text-accent">{n}</span><h2 className="mt-2 font-semibold text-fg">{t}</h2><p className="mt-2 text-sm leading-6 text-muted">{d}</p></li>)}</ol>
        <p className="text-sm leading-7 text-muted">Submitting content does not itself approve quality, ownership, rights, licensing or publication. Each decision remains subject to its applicable review.</p>
        <div className="flex flex-wrap gap-3"><Link to="/signup" search={{role:"creator"}} className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-[#041018]">Start as Creator</Link><Link to="/login" className="rounded-full border border-line px-6 py-3 text-sm font-semibold">Sign in</Link></div>
      </article>
    </main>
  );
}
