import { describe, it, expect, vi, beforeEach } from "vitest";
import { ctppFetch } from "../src/apiClient.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ctppFetch", () => {
  it("sets X-API-Key header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await ctppFetch("/datasets", {}, "test-key-123");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/datasets");
    expect(options.headers["X-API-Key"]).toBe("test-key-123");
  });

  it("appends query parameters to URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await ctppFetch("/data/2021", { get: "B101100_e1", for: "county:*" }, "key");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("get=B101100_e1");
    expect(url).toContain("for=county");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Invalid API Key",
    });

    await expect(ctppFetch("/datasets", {}, "bad-key")).rejects.toThrow(
      "CTPP API error 401",
    );
  });
});
