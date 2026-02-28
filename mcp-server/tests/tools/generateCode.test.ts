import { describe, it, expect } from "vitest";
import { GenerateCode } from "../../src/tools/generateCode.js";

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
  it("does not require an API key", () => {
    expect(tool.requiresApiKey).toBe(false);
  });

  describe("R output", () => {
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

    it("omits inGeo when not provided", async () => {
      const args = { ...baseArgs, language: "r" as const };
      delete (args as Partial<typeof baseArgs>).inGeo;
      const { content } = await tool.run(
        { year: 2021, get: "B101100_e1", forGeo: "state:*", page: 1, size: 25, format: "list", language: "r" },
        "",
      );
      // 'in' param should not appear when inGeo is absent
      expect(content[0].text).not.toMatch(/`in`\s*=/);
    });
  });

  describe("Python output", () => {
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

    it("uses string keys (no backtick quoting needed)", async () => {
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

    it("includes inGeo when provided", async () => {
      const { content } = await tool.run({ ...baseArgs, language: "python" }, "");
      expect(content[0].text).toContain('"state:53"');
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
});
