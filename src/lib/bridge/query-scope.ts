/** User and organization identity used to isolate cached workspace data. */
export type BridgeWorkspaceActor = {
  userId: string;
  organizationId?: string | null;
};

/** React Query keys for private workspace data must never be global. */
export function bridgeWorkspaceQueryKey(name: string, actor: BridgeWorkspaceActor) {
  return [name, actor.userId, actor.organizationId ?? null] as const;
}
