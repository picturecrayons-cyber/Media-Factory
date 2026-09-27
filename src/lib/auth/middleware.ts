import { createMiddleware } from "@tanstack/react-start";

/**
 * Server function auth middleware.
 * Verifies the caller's Supabase bearer token and supplies the verified
 * userId and userEmail to the server function context.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("./client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUser } = await import("./verify.server");
    assertSameSiteRequest();
    const user = await requireUser(context.bearerToken);
    return next({ context: { userId: user.id, userEmail: user.email } });
  });
