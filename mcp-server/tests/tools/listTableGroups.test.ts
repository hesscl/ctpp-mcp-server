import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListTableGroups } from "../../src/tools/listTableGroups.js";

vi.mock("../../src/apiClient.js", () => ({
  ctppFetch: vi.fn(),
}));

import { ctppFetch } from "../../src/apiClient.js";
const mockFetch = vi.mocked(ctppFetch);

describe("ListTableGroups", () => {
  const tool = new ListTableGroups();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls /datasets/{year}/groups with year in path", async () => {
    mockFetch.mockResolvedValueOnce({
      size: 1,
      page: 1,
      total: 1,
      data: [{ name: "B101100", description: "Means of Transportation" }],
    });

    const result = await tool.run({ year: 2021, page: 1, size: 50 }, "key");

    expect(mockFetch).toHaveBeenCalledWith(
      "/datasets/2021/groups",
      expect.objectContaining({ page: 1, size: 50 }),
      "key",
    );
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.groups[0].name).toBe("B101100");
  });

  it("passes keyword param when provided", async () => {
    mockFetch.mockResolvedValueOnce({ size: 0, page: 1, total: 0, data: [] });

    await tool.run({ year: 2021, keyword: "transit", page: 1, size: 50 }, "key");

    expect(mockFetch).toHaveBeenCalledWith(
      "/datasets/2021/groups",
      expect.objectContaining({ keyword: "transit" }),
      "key",
    );
  });
});
