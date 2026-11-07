import { useAuthSessionState } from "./provider";

export type { AppUser } from "./provider";
export type CurrentUserState = {
  user: import("./provider").AppUser | null;
  isPending: boolean;
  authError: string | null;
  retry: () => void;
};

/** All Bridge routes share the single root-level auth bootstrap. */
export function useCurrentUserState(): CurrentUserState {
  const { user, isPending, authError, retry } = useAuthSessionState();
  return { user, isPending, authError, retry };
}

export function useCurrentUser(): import("./provider").AppUser | null {
  return useAuthSessionState().user;
}
