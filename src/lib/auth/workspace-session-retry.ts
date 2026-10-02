type UserCheck = {
  data: { user: { id: string } | null };
  error: { status?: number; name?: string } | null;
};

export async function retryWorkspaceSession(input: {
  checkUser: () => Promise<UserCheck>;
  refetch: () => Promise<unknown>;
  signIn: () => Promise<void>;
}): Promise<"retried" | "expired" | "unavailable"> {
  let result: UserCheck;
  try {
    result = await input.checkUser();
  } catch {
    return "unavailable";
  }
  if (result.error) {
    // Only explicit authentication rejection may discard the local session.
    if (result.error.status === 401 || result.error.name === "AuthSessionMissingError") {
      await input.signIn();
      return "expired";
    }
    return "unavailable";
  }
  if (!result.data.user) return "unavailable";
  await input.refetch();
  return "retried";
}
