import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerateCode } from "../../src/tools/generateCode.js";

vi.mock("../../src/apiClient.js", () => ({
  ctppFetch: vi.fn(),
}));

import { ctppFetch } from "../../src/apiClient.js";
const mockFetch = vi.mocked(ctppFetch);

const tool = new GenerateCode();

// Shared args for a basic residence-table query (no flow params)
const baseArgs = {
  year: 2021 as const,
  get: "B101100_e1,B101100_m1",
  forGeo: "county:*",
  inGeo: "state:53",
  page: 1,
  size: 25,
  format: "list" as const,
};

// Shared args for a flow (O-D) query
const flowArgs = {
  year: 2016 as const,
  get: "B302100_e1",
  forGeo: "county:*",
  inGeo: "state:53",
  dForGeo: "county:*",
  dInGeo: "state:53",
  page: 1,
  size: 25,
  format: "list" as const,
};

describe("GenerateCode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("does not require an API key", () => {
    expect(tool.requiresApiKey).toBe(false);
  });

  describe("R output — single page", () => {
    it("returns non-error result", async () => {
      const result = await tool.run({ ...baseArgs, language: "r" }, "");
      expect(result.isError).toBeUndefined();
    });

    it("includes httr2 and dplyr imports", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).toContain("library(httr2)");
      expect(code).toContain("library(dplyr)");
    });

    it("reads api key from environment variable", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      expect(content[0].text).toContain('Sys.getenv("CTPP_API_KEY")');
    });

    it("targets the correct year path", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      expect(content[0].text).toContain('req_url_path_append("data/2021")');
    });

    it("includes the correct year label in a comment", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      expect(content[0].text).toContain("2017–2021 ACS 5-Year");
    });

    it("includes the correct year label for 2016", async () => {
      const { content } = await tool.run({ ...flowArgs, language: "r" }, "");
      expect(content[0].text).toContain("2012–2016 ACS 5-Year");
    });

    it("backtick-quotes reserved words 'for' and 'in'", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).toMatch(/`for`\s*=/);
      expect(code).toMatch(/`in`\s*=/);
    });

    it("includes get and forGeo values", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).toContain('"B101100_e1,B101100_m1"');
      expect(code).toContain('"county:*"');
    });

    it("includes inGeo when provided", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      expect(content[0].text).toContain('"state:53"');
    });

    it("omits 'd-for' and 'd-in' for non-flow tables", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).not.toContain("`d-for`");
      expect(code).not.toContain("`d-in`");
    });

    it("backtick-quotes 'd-for' and 'd-in' for flow tables", async () => {
      const { content } = await tool.run({ ...flowArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).toMatch(/`d-for`\s*=/);
      expect(code).toMatch(/`d-in`\s*=/);
    });

    it("labels flow tables as origin-destination in comment", async () => {
      const { content } = await tool.run({ ...flowArgs, language: "r" }, "");
      expect(content[0].text).toContain("origin-destination");
    });

    it("parses response into a data frame with bind_rows", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r" }, "");
      const code = content[0].text;
      expect(code).toContain("bind_rows");
      expect(code).toContain("result$data");
    });

    it("omits 'in' when inGeo is not provided", async () => {
      const { content } = await tool.run(
        { year: 2021, get: "B101100_e1", forGeo: "state:*", page: 1, size: 25, format: "list", language: "r" },
        "",
      );
      expect(content[0].text).not.toMatch(/`in`\s*=/);
    });
  });

  describe("Python output — single page", () => {
    it("returns non-error result", async () => {
      const result = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(result.isError).toBeUndefined();
    });

    it("includes os, requests, and pandas imports", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).toContain("import os");
      expect(code).toContain("import requests");
      expect(code).toContain("import pandas as pd");
    });

    it("reads api key from environment variable", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(content[0].text).toContain('os.environ.get("CTPP_API_KEY"');
    });

    it("targets the correct year in the URL", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(content[0].text).toContain("/data/2021");
    });

    it("includes the correct year label in a comment", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(content[0].text).toContain("2017–2021 ACS 5-Year");
    });

    it("uses string keys for 'for' and 'in' (no backtick quoting needed)", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).toContain('"for"');
      expect(code).toContain('"in"');
    });

    it("includes get and forGeo values", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).toContain('"B101100_e1,B101100_m1"');
      expect(code).toContain('"county:*"');
    });

    it("omits 'd-for' and 'd-in' for non-flow tables", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).not.toContain('"d-for"');
      expect(code).not.toContain('"d-in"');
    });

    it("includes 'd-for' and 'd-in' for flow tables", async () => {
      const { content } = await tool.run({ ...flowArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).toContain('"d-for"');
      expect(code).toContain('"d-in"');
    });

    it("labels flow tables as origin-destination in comment", async () => {
      const { content } = await tool.run({ ...flowArgs, language: "python" }, "");
      expect(content[0].text).toContain("origin-destination");
    });

    it("calls raise_for_status and wraps data in a DataFrame", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      const code = content[0].text;
      expect(code).toContain("raise_for_status()");
      expect(code).toContain('pd.DataFrame(resp.json()["data"])');
    });

    it("sets a request timeout", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(content[0].text).toContain("timeout=30");
    });
  });

  describe("annotate=true", () => {
    const mockLabels = {
      data: [
        { name: "b101100_e1", label: "Total workers: Estimate" },
        { name: "b101100_m1", label: "Total workers: Margin of error" },
      ],
    };

    it("calls the variables API with the correct table code and year", async () => {
      mockFetch.mockResolvedValueOnce(mockLabels);
      await tool.run({ ...baseArgs, language: "r", annotate: true }, "test-key");
      expect(mockFetch).toHaveBeenCalledWith(
        "/groups/B101100/variables",
        { year: 2021 },
        "test-key",
      );
    });

    it("embeds matching variable labels as comments in R output", async () => {
      mockFetch.mockResolvedValueOnce(mockLabels);
      const { content } = await tool.run({ ...baseArgs, language: "r", annotate: true }, "test-key");
      const code = content[0].text;
      expect(code).toContain("# Variable labels:");
      expect(code).toContain("b101100_e1: Total workers: Estimate");
      expect(code).toContain("b101100_m1: Total workers: Margin of error");
    });

    it("embeds matching variable labels as comments in Python output", async () => {
      mockFetch.mockResolvedValueOnce(mockLabels);
      const { content } = await tool.run({ ...baseArgs, language: "python", annotate: true }, "test-key");
      const code = content[0].text;
      expect(code).toContain("# Variable labels:");
      expect(code).toContain("b101100_e1: Total workers: Estimate");
    });

    it("places the label block before the API call", async () => {
      mockFetch.mockResolvedValueOnce(mockLabels);
      const { content } = await tool.run({ ...baseArgs, language: "r", annotate: true }, "test-key");
      const code = content[0].text;
      const labelPos = code.indexOf("# Variable labels:");
      const reqPos = code.indexOf("resp <- request(");
      expect(labelPos).toBeGreaterThan(0);
      expect(labelPos).toBeLessThan(reqPos);
    });

    it("skips annotation silently when apiKey is empty", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r", annotate: true }, "");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(content[0].text).not.toContain("# Variable labels:");
    });

    it("skips annotation silently when the API call fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("API error"));
      const { content } = await tool.run({ ...baseArgs, language: "r", annotate: true }, "test-key");
      expect(content[0].text).not.toContain("# Variable labels:");
      expect(content[0].isError).toBeUndefined();
    });

    it("only includes labels for the requested variables, not the whole table", async () => {
      // Return more variables than requested
      mockFetch.mockResolvedValueOnce({
        data: [
          { name: "b101100_e1", label: "Total workers: Estimate" },
          { name: "b101100_m1", label: "Total workers: Margin of error" },
          { name: "b101100_e2", label: "Car, truck, or van: Estimate" },
        ],
      });
      // baseArgs only requests b101100_e1 and b101100_m1
      const { content } = await tool.run({ ...baseArgs, language: "r", annotate: true }, "test-key");
      expect(content[0].text).toContain("b101100_e1");
      expect(content[0].text).toContain("b101100_m1");
      expect(content[0].text).not.toContain("b101100_e2");
    });

    it("extracts table code from group() syntax", async () => {
      mockFetch.mockResolvedValueOnce({ data: [{ name: "b202105_e1", label: "Mode: Drove alone" }] });
      await tool.run(
        { ...baseArgs, get: "group(B202105)", language: "r", annotate: true },
        "test-key",
      );
      expect(mockFetch).toHaveBeenCalledWith("/groups/B202105/variables", expect.anything(), "test-key");
    });

    it("lists all labels when group() syntax is used", async () => {
      mockFetch.mockResolvedValueOnce({
        data: [
          { name: "b202105_e1", label: "Mode: Drove alone" },
          { name: "b202105_e2", label: "Mode: Carpooled" },
        ],
      });
      const { content } = await tool.run(
        { ...baseArgs, get: "group(B202105)", language: "r", annotate: true },
        "test-key",
      );
      const code = content[0].text;
      expect(code).toContain("b202105_e1: Mode: Drove alone");
      expect(code).toContain("b202105_e2: Mode: Carpooled");
    });
  });

  describe("fetchAll=true", () => {
    it("generates a repeat loop in R", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r", fetchAll: true }, "");
      const code = content[0].text;
      expect(code).toContain("repeat {");
      expect(code).toContain("all_data <- list()");
      expect(code).toContain("page <- 1L");
      expect(code).toContain("page <- page + 1L");
    });

    it("uses 1000L as page size in R loop", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r", fetchAll: true }, "");
      expect(content[0].text).toContain("1000L");
    });

    it("breaks on short page in R", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r", fetchAll: true }, "");
      expect(content[0].text).toContain("if (length(result$data) < 1000L) break");
    });

    it("accumulates pages and binds rows in R", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "r", fetchAll: true }, "");
      const code = content[0].text;
      expect(code).toContain("all_data <- c(all_data, result$data)");
      expect(code).toContain("bind_rows(all_data)");
    });

    it("generates a while loop in Python", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python", fetchAll: true }, "");
      const code = content[0].text;
      expect(code).toContain("while True:");
      expect(code).toContain("all_data = []");
      expect(code).toContain("page = 1");
      expect(code).toContain("page += 1");
    });

    it("uses size=1000 and spreads page/size into request in Python", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python", fetchAll: true }, "");
      const code = content[0].text;
      expect(code).toContain("size = 1000");
      expect(code).toContain('"page": page, "size": size');
    });

    it("breaks on short batch in Python", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python", fetchAll: true }, "");
      expect(content[0].text).toContain("if len(batch) < size:");
    });

    it("accumulates pages into a DataFrame in Python", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python", fetchAll: true }, "");
      const code = content[0].text;
      expect(code).toContain("all_data.extend(batch)");
      expect(code).toContain("pd.DataFrame(all_data)");
    });

    it("does not use single-page DataFrame pattern when fetchAll is true", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python", fetchAll: true }, "");
      expect(content[0].text).not.toContain('pd.DataFrame(resp.json()["data"])');
    });
  });

  describe("annotate=true + fetchAll=true", () => {
    it("includes both label comments and a pagination loop in R", async () => {
      mockFetch.mockResolvedValueOnce({
        data: [{ name: "b101100_e1", label: "Total workers: Estimate" }],
      });
      const { content } = await tool.run(
        { ...baseArgs, language: "r", annotate: true, fetchAll: true },
        "test-key",
      );
      const code = content[0].text;
      expect(code).toContain("# Variable labels:");
      expect(code).toContain("b101100_e1: Total workers: Estimate");
      expect(code).toContain("repeat {");
      expect(code).toContain("bind_rows(all_data)");
    });

    it("includes both label comments and a pagination loop in Python", async () => {
      mockFetch.mockResolvedValueOnce({
        data: [{ name: "b101100_e1", label: "Total workers: Estimate" }],
      });
      const { content } = await tool.run(
        { ...baseArgs, language: "python", annotate: true, fetchAll: true },
        "test-key",
      );
      const code = content[0].text;
      expect(code).toContain("# Variable labels:");
      expect(code).toContain("while True:");
      expect(code).toContain("pd.DataFrame(all_data)");
    });
  });
});
