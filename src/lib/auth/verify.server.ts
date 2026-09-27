const supabaseUrl =
  process.env.SUPABASE_URL?.replace(/\/$/, "") ||
  process.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ||
  "https://mlmgugivsyoxzdgwkbpu.supabase.co";

const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_8XCMcaqHvYMWANqxqnS0mw_f_asubxB";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  user_metadata?: Record<string, unknown>;
};

export async function getSessionUser(bearerToken?: string): Promise<VerifiedUser | null> {
  if (!bearerToken || !supabaseUrl || !supabasePublishableKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) return null;
    const user = (await response.json()) as {
      id?: string;
      email?: string | null;
      email_confirmed_at?: string | null;
      user_metadata?: Record<string, unknown>;
    };

    if (!user.id) return null;
    return {
      id: user.id,
      email: user.email ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      user_metadata: user.user_metadata,
    };
  } catch (err) {
    console.error("[auth] Failed to verify Supabase token:", err);
    return null;
  }
}

export async function requireUser(bearerToken?: string): Promise<VerifiedUser> {
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError("Valid Supabase authentication session required.");
  return user;
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  const user = await requireUser(bearerToken);
  return user.id;
}
