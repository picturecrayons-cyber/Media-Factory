export class TimeoutError extends Error {
  readonly code = "WORKSPACE_TIMEOUT";

  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Reject a stalled client request without cancelling or mutating its auth session. */
export async function withTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  message = "The request timed out.",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
