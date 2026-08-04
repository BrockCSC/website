export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    throw new ApiError(
      response.status,
      `${init.method ?? "GET"} ${path} failed`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};
