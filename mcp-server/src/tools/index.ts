import { z } from "zod";
import { BaseTool } from "./BaseTool.js";
import { ListDatasets } from "./listDatasets.js";
import { ListTableGroups } from "./listTableGroups.js";
import { GetTableVariables } from "./getTableVariables.js";
import { GetGroupGeographies } from "./getGroupGeographies.js";
import { FetchCtppData } from "./fetchCtppData.js";
import { ResolveGeographyFips } from "./resolveGeographyFips.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: BaseTool<z.ZodTypeAny>[] = [
  new ListDatasets(),
  new ListTableGroups(),
  new GetTableVariables(),
  new GetGroupGeographies(),
  new FetchCtppData(),
  new ResolveGeographyFips(),
];
