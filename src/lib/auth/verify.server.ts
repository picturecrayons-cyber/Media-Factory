const supabaseUrl =
  process.env.SUPABASE_URL?.replace(/\/$/, "") ||
  process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");

const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase authentication configuration is missing.");
}

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
  if (!bearerToken) return null;

  try {
    const headers = new Headers();
    headers.set("apikey", supabasePublishableKey);
    headers.set("Authorization", `Bearer ${bearerToken}`);

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedError("Supabase authentication session is invalid or expired.");
      }
      throw new Error(`Supabase authentication service returned ${response.status}.`);
    }
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
    if (err instanceof UnauthorizedError) throw err;
    console.error("[auth] Failed to verify Supabase token:", err);
    throw err;
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
