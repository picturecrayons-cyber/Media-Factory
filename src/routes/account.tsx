import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CinemaShell } from "@/components/cinema-shell";
import { Button } from "@/components/ui/button";
import {
  addProfile,
  getAccountSnapshot,
  getEntitlements,
  listProfiles,
  listTitles,
  setActiveProfile,
} from "@/lib/cinema";
import { CATALOG } from "@/lib/catalog";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCinemaUI } from "@/lib/cinema-ui";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const { user, isPending } = useCurrentUserState();
  const titlesQ = useQuery({ queryKey: ["titles"], queryFn: () => listTitles() });
  const titles = titlesQ.data?.length ? titlesQ.data : CATALOG;
  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: () => listProfiles(),
    enabled: !!user,
  });
  const entQ = useQuery({
    queryKey: ["entitlements"],
    queryFn: () => getEntitlements(),
    enabled: !!user,
  });
  const snapQ = useQuery({
    queryKey: ["account-snap"],
    queryFn: () => getAccountSnapshot(),
    enabled: !!user,
  });
  const qc = useQueryClient();
  const setKids = useCinemaUI((s) => s.setKidsMode);
  const [name, setName] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const addMut = useMutation({
    mutationFn: () => addProfile({ data: { name, kind: "adult" } }),
    onSuccess: () => {
      setName("");
      toast("Profile added");
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
  const activeMut = useMutation({
    mutationFn: (id: string) => setActiveProfile({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  if (isPending) {
    return (
      <CinemaShell titles={titles}>
        <main className="px-6 pt-28 text-muted">Loading account…</main>
      </CinemaShell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const sub = entQ.data?.subscription;
  const snap = snapQ.data;
  const memberSince = snap?.memberSince
    ? new Date(snap.memberSince).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <CinemaShell titles={titles}>
      <main id="account" className="mx-auto max-w-3xl space-y-10 px-4 pt-24 pb-16 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.22em] text-loop uppercase">Account & profiles</p>
            <h1 className="font-display mt-2 text-3xl tracking-wide">Manage cinema profiles</h1>
            <p className="mt-2 text-sm text-muted">
              Family & kids access, active passes, and billing.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-line bg-elevated p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-14 place-items-center rounded-lg bg-fg/10 font-display text-xl">
              {(user.displayName ?? user.primaryEmail ?? "A").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.displayName ?? "Cinema member"}</p>
              <p className="truncate text-sm text-muted">{user.primaryEmail ?? "—"}</p>
              <p className="mt-2 font-mono text-[11px] text-faint">
                Account ID · {snap?.accountId ?? user.id}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Member since", memberSince],
              ["Streaming quality", snap?.streamingQuality ?? "Master 4K Ultra HD"],
              ["Security status", snap?.securityStatus ?? "Verified Auth"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-bg p-3">
                <dt className="text-[11px] tracking-wide text-muted uppercase">{k}</dt>
                <dd className="mt-1 text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="profiles">
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Profiles & family safe modes</h2>
          <p className="mt-2 text-sm text-muted">
            Personalize viewing histories and family safe restrictions.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {profilesQ.data?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => activeMut.mutate(p.id)}
                className={cn(
                  "rounded-lg border p-4 text-left",
                  p.isActive ? "border-fg bg-fg/10" : "border-line hover:border-line-strong",
                )}
              >
                <span className="grid size-12 place-items-center rounded-md bg-elevated font-display text-lg">
                  {p.name.charAt(0)}
                </span>
                <p className="mt-3 text-sm">{p.kind === "kids" ? "Kids & Family" : p.name === "Primary" ? "Primary Profile" : p.name}</p>
                <p className="text-[11px] tracking-wide text-muted uppercase">
                  {p.kind === "kids"
                    ? "U-Rated Safe Cinema"
                    : p.isActive
                      ? "Active · Unrestricted Master"
                      : "Adult"}
                </p>
              </button>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) addMut.mutate();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add profile"
              className="h-11 flex-1 rounded-md border border-line bg-elevated px-3 text-sm outline-none"
            />
            <Button type="submit" variant="outline">
              Add profile
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-elevated p-5">
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Kids & family</h2>
          <p className="mt-2 text-sm text-muted">
            Parental gate PIN is enabled for exiting Kids mode (default 0000).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setKids(true);
                window.location.href = "/kids";
              }}
            >
              Launch Kids
            </Button>
            <Link to="/kids">
              <Button variant="outline">Kids portal</Button>
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-panel p-5">
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Subscription & entitlement</h2>
          {sub ? (
            <>
              <p className="mt-3 text-sm">
                Active pass · {sub.plan_key === "annual" ? "Loop Annual" : "Loop Monthly"}
              </p>
              <p className="mt-1 text-xs text-muted">Unlimited festival catalog unlocked.</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm">No active subscription · Free account</p>
              <p className="mt-1 text-sm text-muted">
                Unlock the full curated festival catalog with an unlimited pass.
              </p>
            </>
          )}
          <Link to="/plans" className="mt-4 inline-block">
            <Button variant="outline">View plans</Button>
          </Link>
        </section>

        <section>
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Payment history & invoices</h2>
          {(snap?.invoices ?? []).length ? (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Kind</th>
                  <th className="pb-2 font-medium">INR</th>
                </tr>
              </thead>
              <tbody>
                {snap?.invoices.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="py-2 text-muted">{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.kind}</td>
                    <td>₹{row.amount_inr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted">No past transactions recorded yet.</p>
          )}
        </section>

        <section>
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Navigation</h2>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
            <a href="#profiles" className="hover:text-fg">
              Profiles & kids gate
            </a>
            <Link to="/kids" className="hover:text-fg">
              Enter kids safe mode
            </Link>
            <Link to="/my-list" className="hover:text-fg">
              My watchlist
            </Link>
            <Link to="/plans" className="hover:text-fg">
              Passes & pricing
            </Link>
            <Link to="/submit-film" className="hover:text-fg">
              Submit film
            </Link>
            <Link to="/admin" className="hover:text-fg">
              Mission Control
            </Link>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-elevated p-5">
          <h2 className="text-sm tracking-[0.16em] text-muted uppercase">Current device session</h2>
          <p className="mt-2 text-sm text-muted">{snap?.session ?? "Browser · Web Cinema · Authenticated session"}</p>
          {authEnabled ? (
            <Button
              variant="outline"
              className="mt-4"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOut().catch(() => setSigningOut(false));
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          ) : null}
        </section>
      </main>
    </CinemaShell>
  );
}
