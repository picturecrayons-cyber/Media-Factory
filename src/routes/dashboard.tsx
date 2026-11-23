import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireBridge } from "@/components/bridge/gate";
import { BridgeShell } from "@/components/bridge/shell";
import { listTitles } from "@/lib/bridge/titles";
import { listBridgeAdminOwnerSubmissionQueue } from "@/lib/bridge/owner-submission-intake";
import type { BridgeActor } from "@/lib/bridge/session";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <RequireBridge allow="super_admin">
      {(actor) => (
        <BridgeShell actor={actor} title="Founder Centre">
          <DashboardBody actor={actor} />
        </BridgeShell>
      )}
    </RequireBridge>
  );
}

function getIndiaGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function DashboardBody({ actor }: { actor: BridgeActor }) {
  const [greeting, setGreeting] = useState("Good morning");
  useEffect(() => {
    const refresh = () => setGreeting(getIndiaGreeting());
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const titlesQ = useQuery({
    queryKey: ["bridge-titles"],
    queryFn: () => listTitles(),
    retry: 1,
  });
  const submissionsQ = useQuery({
    queryKey: ["bridge-admin-owner-submission-queue"],
    queryFn: () => listBridgeAdminOwnerSubmissionQueue(),
    retry: false,
  });

  const titles = titlesQ.data?.titles ?? [];
  const awaitingReview = titles.filter((title) =>
    ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY"].includes(title.status),
  ).length;
  const titleCount = titlesQ.isSuccess ? String(titles.length) : "Not available";
  const reviewCount = titlesQ.isSuccess ? String(awaitingReview) : "Not available";
  const peopleCount = "Not available";
  const organizationCount = "Not available";
  const submissions = submissionsQ.data?.submissions ?? [];

  const quickActions = [
    { title: "Title Library", description: "Open title records and submissions.", to: "/workspace" },
    { title: "QC & Rights", description: "Review operational decisions.", to: "/admin/workstations" },
    { title: "Buyers & Organizations", description: "Manage buyer access and organizations.", to: "/admin/buyers" },
    { title: "Audit & Security", description: "Inspect persisted operator activity.", to: "/admin/audit" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Crayons Bridge · Super Admin
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting}, Super Admin
        </h2>
        <p className="mt-2 text-sm text-muted">
          Here are the items that need your attention today.
        </p>
      </section>

      <section aria-labelledby="owner-submissions-title" className="rounded-2xl border border-accent/40 bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Action required · Review queue</p>
            <h3 id="owner-submissions-title" className="mt-2 font-display text-2xl font-semibold">
              Owner Submissions
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Review finished-film submissions sent by Creators and Studios. Accepting intake does not approve QC, Rights, Legal, Licensing or Loop publication.
            </p>
          </div>
          <div className="min-w-[8rem] rounded-xl border border-line px-4 py-3 text-right">
            <p className="text-xs text-muted">Pending</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {submissionsQ.isSuccess ? submissions.length : "Not available"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {submissionsQ.isPending
              ? "Loading owner submissions…"
              : submissionsQ.isError
                ? "Queue unavailable. The count is not assumed to be zero."
                : submissions.length
                  ? "Submissions are waiting for an Admin decision."
                  : "No pending submissions."}
          </p>
          <Link to="/internal" className="inline-flex items-center rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-bg hover:opacity-90">
            Open submission queue →
          </Link>
        </div>
      </section>

      <section aria-label="Operational status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Title Library" value={titleCount} note="Total titles returned by the title query" />
        <Stat label="QC & Rights" value={reviewCount} note="Titles awaiting review in these stages" />
        <Stat label="People" value={peopleCount} note="Verified profiles · source not connected" />
        <Stat label="Organizations" value={organizationCount} note="Active organizations · source not connected" />
      </section>

      <section aria-labelledby="quick-actions-title" className="space-y-3">
        <div>
          <h3 id="quick-actions-title" className="font-display text-xl font-semibold">Quick Actions</h3>
          <p className="mt-1 text-sm text-muted">Open the right workspace in one step.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((item) => (
            <Link key={item.title} to={item.to} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold">{item.title}</h4>
                <span aria-hidden="true" className="text-accent">→</span>
              </div>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
              <p className="mt-4 text-xs font-semibold text-accent">Open →</p>
            </Link>
          ))}
        </div>
      </section>
      <p className="text-xs text-muted">
        Counts are shown only when their source query succeeds. “Not available” means the data source is not connected or did not respond; it is not a zero count.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}
