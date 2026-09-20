import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { platformOverview } from "@/lib/cinema";
import { COMMAND_CENTERS, COMMAND_GROUPS } from "@/lib/command-centers";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin/command-center")({ component: CommandMap });

function CommandMap() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["overview"], queryFn: () => platformOverview(), enabled: !!user });
  if (isPending) return <main className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!user) return <RedirectToSignIn />;
  const o = q.data;

  return (
    <AdminShell>
      <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Mapped surface</p>
      <h1 className="font-display mt-1 text-3xl tracking-wide">10 Command Centers</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Database {o?.db ?? "—"} · Schema {o?.schema ?? "—"} · Razorpay {o?.razorpay ?? "—"}.
        Territory geo-fence: IN, AE, US, GB · Fail-closed {o?.failClosed ? "ACTIVE" : "open"}.
      </p>
      <div className="mt-8 space-y-8">
        {COMMAND_GROUPS.map((g) => (
          <section key={g.id}>
            <h2 className="text-sm tracking-[0.16em] text-muted uppercase">{g.label}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {COMMAND_CENTERS.filter((c) => c.group === g.id).map((c) => (
                <article key={c.id} className="flex flex-col rounded-lg border border-line bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-faint">COMMAND CENTER {c.id}</span>
                    <span className="text-[10px] tracking-wide text-ok uppercase">{c.status}</span>
                  </div>
                  <h3 className="mt-2 font-medium">{c.title}</h3>
                  <p className="mt-1 flex-1 text-xs text-muted">{c.kicker}</p>
                  {c.id === "02" ? (
                    <p className="mt-3 font-mono text-[11px] text-faint">
                      {o?.hlsReady ?? 0} HLS stream(s) ready · {o?.s3}
                    </p>
                  ) : null}
                  {c.id === "03" ? (
                    <p className="mt-3 font-mono text-[11px] text-faint">
                      {o?.territoriesOn ?? 0} territories enforced
                    </p>
                  ) : null}
                  {c.id === "04" ? (
                    <p className="mt-3 font-mono text-[11px] text-faint">{o?.qcPass ?? 0} QC pass(es)</p>
                  ) : null}
                  {c.id === "07" ? (
                    <p className="mt-3 font-mono text-[11px] text-faint">{o?.edge}</p>
                  ) : null}
                  <a
                    href={c.href}
                    className="mt-4 inline-flex h-10 w-fit items-center rounded-md border border-line px-3 text-xs tracking-wide uppercase hover:border-line-strong"
                  >
                    {c.action}
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
