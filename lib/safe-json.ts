/* The problem this solves, which the teardown found in the photo upload:
   when a request is rejected by the platform rather than by our own code,
   the body is HTML or plain text, not JSON. Calling res.json() on it throws,
   the catch block assumes the network failed, and the user is told to check
   their connection when the real answer is "that was too big" or "that
   timed out".

   Every fetch in the revision app goes through this. Worth using in
   lib/api.ts for the upload path too. */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function readResponse<T>(res: Response): Promise<ApiResult<T>> {
  const body = await res.text();

  let parsed: unknown = null;
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }

  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const { error } = parsed as { error?: unknown };
    return { ok: false, error: typeof error === "string" ? error : "Something went wrong." };
  }

  if (!res.ok) {
    if (res.status === 413) {
      return { ok: false, error: "That was too big to send. Try it in smaller pieces." };
    }
    if (res.status === 504 || res.status === 408) {
      return { ok: false, error: "That took too long and timed out. Try a shorter batch." };
    }
    return { ok: false, error: `The server said no (${res.status}).` };
  }

  if (parsed === null) {
    return { ok: false, error: "The server sent something unreadable." };
  }

  return { ok: true, data: parsed as T };
}
