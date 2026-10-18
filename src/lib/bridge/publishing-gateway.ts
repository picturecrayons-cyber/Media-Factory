import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { writeAudit } from "./audit";
import {
  canRequestPublishingGatewayRelease,
  initialPublishingGatewayState,
  publishingGatewayIsReady,
  type PublishingGatewayGate,
} from "./publishing-gateway-policy";

type JsonRecord = Record<string, unknown>;
const GITHUB_REPOS = [
  { name: "Bridge", repo: "picturecrayons-cyber/Media-Factory" },
  { name: "Crayons Loop", repo: "picturecrayons-cyber/crayons-loop-streaming-platform" },
] as const;
const DOMAINS = [
  { domain: "crayonsloop.in", project: "crayonsloop" },
  { domain: "crayonspictures.in", project: "bridge" },
] as const;

function gate(id: string, label: string, status: PublishingGatewayGate["status"], detail: string): PublishingGatewayGate {
  return { id, label, status, detail };
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonRecord | null> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data as JsonRecord : null;
  } catch {
    return null;
  }
}

async function verifyGitHub(repo: string): Promise<{ workflow: PublishingGatewayGate; artifacts: PublishingGatewayGate }> {
  const runs = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=1`, {
    headers: { "x-github-api-version": "2022-11-28", "user-agent": "Crayons-Bridge-Publishing-Gateway" },
  });
  const runList = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs as JsonRecord[] : [];
  const latest = runList[0];
  if (!latest || typeof latest.id !== "number") {
    return {
      workflow: gate(`ci:${repo}`, `${repo} GitHub Actions`, "UNVERIFIED", "Latest main-branch workflow run could not be verified."),
      artifacts: gate(`artifacts:${repo}`, `${repo} build artifacts`, "UNVERIFIED", "No verified workflow run is available to inspect."),
    };
  }
  const passed = latest.status === "completed" && latest.conclusion === "success" && latest.head_branch === "main";
  const workflow = gate(
    `ci:${repo}`,
    `${repo} GitHub Actions`,
    passed ? "VERIFIED" : "BLOCKED",
    `Run ${String(latest.id)}: ${String(latest.status ?? "unknown")} / ${String(latest.conclusion ?? "no conclusion")} on ${String(latest.head_branch ?? "unknown branch")}.`,
  );
  const artifactsData = await fetchJson(`https://api.github.com/repos/${repo}/actions/runs/${latest.id}/artifacts`, {
    headers: { "x-github-api-version": "2022-11-28", "user-agent": "Crayons-Bridge-Publishing-Gateway" },
  });
  const artifacts = Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts as JsonRecord[] : [];
  const available = artifacts.some((item) => item.expired !== true);
  return {
    workflow,
    artifacts: gate(
      `artifacts:${repo}`,
      `${repo} build artifacts`,
      passed && available ? "VERIFIED" : artifactsData ? "BLOCKED" : "UNVERIFIED",
      artifactsData ? (available ? `${artifacts.length} artifact(s) listed; at least one is not expired.` : "No available build artifact was found for the latest workflow run.") : "GitHub artifact status could not be retrieved.",
    ),
  };
}

function vercelConfig() {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  return token ? { token, teamId } : null;
}

async function verifyVercelProduction(project: string): Promise<PublishingGatewayGate> {
  const config = vercelConfig();
  if (!config) return gate(`vercel:${project}`, `${project} Vercel Production`, "UNVERIFIED", "VERCEL_TOKEN is not configured; deployment target cannot be verified.");
  const query = new URLSearchParams({ projectId: project, target: "production", limit: "1" });
  if (config.teamId) query.set("teamId", config.teamId);
  const result = await fetchJson(`https://api.vercel.com/v6/deployments?${query.toString()}`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  const deployments = Array.isArray(result?.deployments) ? result.deployments as JsonRecord[] : [];
  const latest = deployments[0];
  const ready = latest?.readyState === "READY" && latest?.target === "production";
  return gate(
    `vercel:${project}`,
    `${project} Vercel Production`,
    ready ? "VERIFIED" : result ? "BLOCKED" : "UNVERIFIED",
    latest ? `Latest production target: ${String(latest.readyState ?? "unknown")}.` : "No verified production deployment was returned.",
  );
}

async function verifyDomain(domain: string, project: string): Promise<PublishingGatewayGate> {
  const config = vercelConfig();
  if (!config) return gate(`domain:${domain}`, `${domain} domain mapping`, "UNVERIFIED", "Vercel API credentials are required to verify project attachment.");
  const query = new URLSearchParams();
  if (config.teamId) query.set("teamId", config.teamId);
  const suffix = query.size ? `?${query.toString()}` : "";
  const assignment = await fetchJson(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${suffix}`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  const attached = assignment?.name === domain && assignment?.verified === true;
  let reachable = false;
  try {
    const response = await fetch(`https://${domain}/`, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    reachable = response.status >= 200 && response.status < 400;
  } catch {
    reachable = false;
  }
  const verified = attached && reachable;
  return gate(
    `domain:${domain}`,
    `${domain} production domain`,
    verified ? "VERIFIED" : assignment ? "BLOCKED" : "UNVERIFIED",
    `Vercel attachment ${attached ? "verified" : "not verified"}; public HTTPS reachability ${reachable ? "passed" : "failed"}.`,
  );
}

async function verifyEndToEndSmoke(): Promise<PublishingGatewayGate> {
  const url = process.env.PUBLISHING_GATEWAY_SMOKE_URL?.trim();
  if (!url) return gate("e2e-smoke", "End-to-end gateway smoke test", "UNVERIFIED", "PUBLISHING_GATEWAY_SMOKE_URL is not configured; no end-to-end result is assumed.");
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return gate("e2e-smoke", "End-to-end gateway smoke test", "BLOCKED", "Smoke-test URL must be a valid HTTPS URL.");
  }
  const result = await fetchJson(parsed.toString());
  const passed = result?.status === "passed" && result?.gateway === "publishing-gateway";
  return gate("e2e-smoke", "End-to-end gateway smoke test", passed ? "VERIFIED" : result ? "BLOCKED" : "UNVERIFIED", passed ? "The configured HTTPS smoke endpoint returned the publishing-gateway PASS contract." : "Expected JSON { status: 'passed', gateway: 'publishing-gateway' } was not verified.");
}

async function collectChecks(): Promise<PublishingGatewayGate[]> {
  const github = await Promise.all(GITHUB_REPOS.map(({ repo }) => verifyGitHub(repo)));
  const vercel = await Promise.all(["crayonsloop", "bridge"].map(verifyVercelProduction));
  const domains = await Promise.all(DOMAINS.map(({ domain, project }) => verifyDomain(domain, project)));
  return [
    ...github.flatMap((item) => [item.workflow, item.artifacts]),
    ...vercel,
    ...domains,
    await verifyEndToEndSmoke(),
  ];
}

async function requireAdmin(userId: string, superAdmin = false) {
  assertNotDevUser(userId);
  const actor = await requireVerifiedActor(userId);
  assertPermission(actor, "audit.read");
  const allowed = superAdmin ? actor.internalRole === "super_admin" : actor.internalRole === "admin" || actor.internalRole === "super_admin";
  if (!allowed) throw new Error(superAdmin ? "Super admin access required" : "Bridge admin access required");
  return actor;
}

export const getPublishingGatewayStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireAdmin(context.userId);
    const checks = await collectChecks();
    const ready = publishingGatewayIsReady(checks);
    const sql = await getSql();
    await writeAudit({
      actorUserId: actor.userId,
      action: "publishing_gateway.status.checked",
      entityType: "publishing_gateway",
      entityId: "crayonsloop.in+crayonspictures.in",
      metadata: { ready, checks: checks.map(({ id, status }) => ({ id, status })) },
    }, sql);
    return { ...initialPublishingGatewayState(), ready, releaseStatus: ready ? "READY_FOR_APPROVAL" as const : "HOLD" as const, checks, checkedAt: new Date().toISOString() };
  });

export const requestPublishingGatewayRelease = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ explicitApproval: z.literal(true) }))
  .handler(async ({ context, data }) => {
    const actor = await requireAdmin(context.userId, true);
    const checks = await collectChecks();
    const ready = publishingGatewayIsReady(checks);
    if (!canRequestPublishingGatewayRelease({ role: actor.internalRole, explicitApproval: data.explicitApproval, gates: checks })) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "publishing_gateway.release.blocked",
        entityType: "publishing_gateway",
        entityId: "crayonsloop.in+crayonspictures.in",
        metadata: { ready, checks: checks.map(({ id, status }) => ({ id, status })) },
      });
      throw new Error("Publishing Gateway release remains on HOLD. Every required check must be verified.");
    }
    await writeAudit({
      actorUserId: actor.userId,
      action: "publishing_gateway.release.approval_recorded",
      entityType: "publishing_gateway",
      entityId: "crayonsloop.in+crayonspictures.in",
      metadata: {
        checks: checks.map(({ id, status }) => ({ id, status })),
        productionChanged: false,
        note: "Explicit approval recorded only; no deployment or production mutation was performed.",
      },
    });
    return { approved: true, productionChanged: false, message: "Approval recorded. No deployment or production change was performed." };
  });
