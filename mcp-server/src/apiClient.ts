const BASE_URL =
  process.env.CTPP_API_URL?.replace(/\/$/, "") ??
  "https://ctppdata.transportation.org/api";

export async function ctppFetch<T>(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CTPP API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}
