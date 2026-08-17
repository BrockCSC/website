/**
 * The bare token endpoint call. It holds no credentials of its own, so callers
 * stay the only place a client secret or a user's password is named.
 */
export const tokenRequest = (
  issuer: string,
  params: Record<string, string>,
): Promise<Response> =>
  fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
