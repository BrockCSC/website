export const tokenRequest = (
  issuer: string,
  params: Record<string, string>,
): Promise<Response> =>
  fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
