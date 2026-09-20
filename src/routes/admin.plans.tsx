import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { PLANS, TVOD } from "@/lib/catalog";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/plans")({ component: AdminPlans });

function AdminPlans() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">CC 08 · Plans & monetization</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">Subscription Plans</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Server-authoritative pricing enforced across checkout. SVOD + TVOD.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <article key={p.key} className="rounded-xl border border-line bg-elevated p-5">
            <p className="text-xs text-muted uppercase">{p.key}</p>
            <h2 className="font-display mt-1 text-xl">{p.name}</h2>
            <p className="mt-2 font-display text-3xl">
              ₹{p.priceInr}
              <span className="text-base text-muted"> / {p.period}</span>
            </p>
            <ul className="mt-4 space-y-1 text-sm text-muted">
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <section className="mt-6 rounded-xl border border-line bg-panel p-5">
        <h3 className="font-display">Transactional TVOD</h3>
        <p className="mt-2 text-sm text-muted">
          48-hr rentals ₹{TVOD.rent} · lifetime purchase ₹{TVOD.buy} · playback gatekeeper on first Play.
        </p>
      </section>
    </AdminShell>
  );
}
