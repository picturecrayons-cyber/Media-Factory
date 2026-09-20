import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { CinemaShell } from "@/components/cinema-shell";
import { Button } from "@/components/ui/button";
import { getEntitlements, listTitles, startSubscription } from "@/lib/cinema";
import { CATALOG, PLANS, TVOD } from "@/lib/catalog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/plans")({ component: Plans });

function Plans() {
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const { user } = useCurrentUserState();
  const entQ = useQuery({
    queryKey: ["entitlements"],
    queryFn: () => getEntitlements(),
    enabled: !!user,
  });
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (planKey: "monthly" | "annual") => startSubscription({ data: { planKey } }),
    onSuccess: (r) => {
      toast(`Loop ${r.planKey} pass is active`);
      void qc.invalidateQueries({ queryKey: ["entitlements"] });
    },
    onError: () => toast("Sign in to start a pass"),
  });
  const active = entQ.data?.subscription?.plan_key;

  return (
    <CinemaShell titles={titles}>
      <main className="mx-auto max-w-6xl px-4 pt-24 pb-16 sm:px-6">
        <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Passes & pricing</p>
        <h1 className="font-display mt-2 text-3xl tracking-[0.08em] uppercase sm:text-4xl">
          Choose your cinema pass
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Stream Malayalam festival cinema and Crayons Originals. Server-authoritative pricing:
          ₹149 / mo · ₹999 / yr · rent ₹{TVOD.rent} · buy ₹{TVOD.buy}.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {PLANS.map((p) => (
            <article
              key={p.key}
              className="relative rounded-xl border border-line bg-elevated p-6"
            >
              {"badge" in p && p.badge ? (
                <span className="absolute top-4 right-4 rounded-full bg-fg px-2 py-0.5 text-[10px] tracking-wide text-bg uppercase">
                  {p.badge}
                </span>
              ) : null}
              <h2 className="font-display text-xl tracking-wide">{p.name}</h2>
              <p className="mt-3 font-display text-4xl">
                ₹{p.priceInr}
                <span className="text-base text-muted"> / {p.period}</span>
              </p>
              <p className="mt-3 text-sm text-muted">{p.blurb}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 text-ok" />
                    {f}
                  </li>
                ))}
              </ul>
              {user ? (
                <Button
                  className="mt-6 w-full"
                  disabled={active === p.key || mut.isPending}
                  onClick={() => mut.mutate(p.key)}
                >
                  {active === p.key ? "Current pass" : `Subscribe now · ₹${p.priceInr}`}
                </Button>
              ) : (
                <Link to="/login" search={{}} className="mt-6 block">
                  <Button className="w-full">Sign in to subscribe</Button>
                </Link>
              )}
            </article>
          ))}
        </div>
        <section className="mt-10 rounded-xl border border-line bg-panel p-6">
          <h3 className="font-display tracking-wide">Transactional (TVOD)</h3>
          <p className="mt-2 text-sm text-muted">
            No pass needed. Rent a title for {TVOD.rentWindowHours} hours at ₹{TVOD.rent}, or buy a
            lifetime 4K digital master at ₹{TVOD.buy}.
          </p>
        </section>
      </main>
    </CinemaShell>
  );
}
