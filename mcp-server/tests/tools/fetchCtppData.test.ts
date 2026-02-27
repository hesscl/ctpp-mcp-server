import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchCtppData } from "../../src/tools/fetchCtppData.js";

vi.mock("../../src/apiClient.js", () => ({
  ctppFetch: vi.fn(),
}));

import { ctppFetch } from "../../src/apiClient.js";
const mockFetch = vi.mocked(ctppFetch);

describe("FetchCtppData", () => {
  const tool = new FetchCtppData();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls /data/{year} with correct params for non-flow table", async () => {
    mockFetch.mockResolvedValueOnce({ size: 1, page: 1, total: 58, data: [] });

    await tool.run(
      {
        year: 2021,
        get: "B101100_e1,B101100_m1",
        forGeo: "county:*",
        inGeo: "state:06",
        page: 1,
        size: 25,
        format: "list",
      },
      "key",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/data/2021",
      expect.objectContaining({
        get: "B101100_e1,B101100_m1",
        for: "county:*",
        in: "state:06",
      }),
      "key",
    );
  });

  it("includes d-for and d-in for flow tables", async () => {
    mockFetch.mockResolvedValueOnce({ size: 1, page: 1, total: 5, data: [] });

    await tool.run(
      {
        year: 2021,
        get: "B302100_e1",
        forGeo: "county:*",
        inGeo: "state:06",
        dForGeo: "county:037",
        dInGeo: "state:06",
        page: 1,
        size: 25,
        format: "list",
      },
      "key",
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/data/2021",
      expect.objectContaining({
        "d-for": "county:037",
        "d-in": "state:06",
      }),
      "key",
    );
  });

  it("omits optional params when not provided", async () => {
    mockFetch.mockResolvedValueOnce({ size: 1, page: 1, total: 1, data: [] });

    await tool.run(
      { year: 2021, get: "B101100_e1", forGeo: "state:*", page: 1, size: 25, format: "list" },
      "key",
    );

    const params = mockFetch.mock.calls[0][1];
    expect(params).not.toHaveProperty("in");
    expect(params).not.toHaveProperty("d-for");
    expect(params).not.toHaveProperty("d-in");
  });
});
