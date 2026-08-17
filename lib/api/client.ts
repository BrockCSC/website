export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new ApiError(
      response.status,
      `${init.method ?? "GET"} ${path} failed`,
      typeof body?.error === "string" ? body.error : undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};
