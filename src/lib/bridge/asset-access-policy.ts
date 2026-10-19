import type { Actor } from "./rbac.ts";
import { hasPermission } from "./rbac.ts";
import type { TitleStatus } from "./types.ts";

export type AssetAccessTitle = { ownerUserId: string; status: TitleStatus };

const ART = new Set(["poster", "poster_vertical", "poster_horizontal", "thumbnail"]);
const QC_KINDS = new Set(["master", "screener", "subtitle", ...ART]);
const LEGAL_KINDS = new Set(["censor_certificate", "subtitle", ...ART]);
const BUYER_KINDS = new Set(["screener", "subtitle", ...ART]);
const AVAILABLE = new Set(["LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]);

function owner(actor: Actor, title: AssetAccessTitle) {
  return !actor.internalRole && actor.userId === title.ownerUserId;
}
function privileged(actor: Actor) {
  return actor.internalRole === "super_admin" || actor.internalRole === "admin";
}
function buyerCanRead(actor: Actor, title: AssetAccessTitle, kind: string, entitled: boolean) {
  return actor.accountType === "buyer" && AVAILABLE.has(title.status) && entitled && BUYER_KINDS.has(kind);
}

export function canViewAsset(actor: Actor, title: AssetAccessTitle, kind: string, entitled = false) {
  if (!actor.emailVerified || !hasPermission(actor, "asset.view")) return false;
  if (owner(actor, title) || privileged(actor)) return true;
  if (actor.internalRole === "qc_reviewer") return QC_KINDS.has(kind);
  if (actor.internalRole === "legal_reviewer") return LEGAL_KINDS.has(kind);
  return buyerCanRead(actor, title, kind, entitled);
}

export function canPreviewAsset(actor: Actor, title: AssetAccessTitle, kind: string, entitled = false) {
  if (!hasPermission(actor, "asset.preview") || !canViewAsset(actor, title, kind, entitled)) return false;
  if (kind === "technical") return false;
  if (owner(actor, title) || privileged(actor)) return true;
  if (actor.internalRole === "qc_reviewer") return QC_KINDS.has(kind);
  if (actor.internalRole === "legal_reviewer") return LEGAL_KINDS.has(kind);
  return buyerCanRead(actor, title, kind, entitled);
}

export function canDownloadAsset(actor: Actor, title: AssetAccessTitle, kind: string, entitled = false) {
  if (!hasPermission(actor, "asset.sign_download")) return false;
  if (owner(actor, title) || privileged(actor)) return true;
  if (actor.internalRole === "qc_reviewer") return QC_KINDS.has(kind);
  if (actor.internalRole === "legal_reviewer") return LEGAL_KINDS.has(kind);
  return buyerCanRead(actor, title, kind, entitled);
}
