import { readFile } from "fs/promises";
import { AnalysisDetail, AnalysisResult } from "../model";
import path from "path";
import assert from "assert";
import { BrowserId, RunId, getBrowserSignature } from "../BrowserId";

export interface AnalysisLabel {
  browserId: BrowserId;
  index: number;
  runId: RunId;
}

export type AnalysisDataQuery = Partial<AnalysisLabel>;

interface SiteAnalysisDataEntry {
  label: AnalysisLabel;
  detail: AnalysisDetail;
}

export class SiteAnalysisData {
  constructor(
    readonly site: string,
    readonly entries: SiteAnalysisDataEntry[]
  ) {}

  all(): AnalysisDetail[] {
    return this.entries.map(({ detail }) => detail);
  }

  select(query: AnalysisDataQuery): AnalysisDetail[] {
    return this.entries
      .filter(({ label: label }) => {
        return (
          (typeof query.browserId === "undefined" ||
            query.browserId === label.browserId) &&
          (typeof query.index === "undefined" || query.index === label.index) &&
          (typeof query.runId === "undefined" || query.runId === label.runId)
        );
      })
      .map(({ detail }) => detail);
  }

  static async fromFile(outputPath: string, site: string) {
    const entry = async (
      browserId: BrowserId,
      index: number,
      runId: RunId
    ): Promise<SiteAnalysisDataEntry> => {
      const suffix = `${getBrowserSignature(browserId)}${index}${runId}`;
      const result = JSON.parse(
        (
          await readFile(path.join(outputPath, `${site}+${suffix}.json`))
        ).toString()
      ) as AnalysisResult;
      assert(result.status === "success");
      return { label: { browserId, index, runId }, detail: result.detail };
    };

    return new SiteAnalysisData(
      site,
      await Promise.all([
        entry("foxhound", 1, "A"),
        entry("foxhound", 1, "B"),
        entry("foxhound", 2, "A"),
        entry("foxhound", 2, "B"),
        entry("firefox", 1, "A"),
        entry("firefox", 1, "B"),
        entry("firefox", 2, "A"),
        entry("firefox", 2, "B"),
        entry("firefox", 3, "A"),
        entry("firefox", 3, "B"),
        entry("firefox", 4, "A"),
        entry("firefox", 4, "B"),
        entry("firefox", 5, "A"),
        entry("firefox", 5, "B"),
        entry("firefox-nops", 1, "A"),
        entry("firefox-nops", 1, "B"),
        entry("firefox-nops", 2, "A"),
        entry("firefox-nops", 2, "B"),
        entry("firefox-nops", 3, "A"),
        entry("firefox-nops", 3, "B"),
        entry("firefox-nops", 4, "A"),
        entry("firefox-nops", 4, "B"),
        entry("firefox-nops", 5, "A"),
        entry("firefox-nops", 5, "B"),
        entry("brave", 1, "A"),
        entry("brave", 1, "B"),
        entry("brave", 2, "A"),
        entry("brave", 2, "B"),
        entry("brave", 3, "A"),
        entry("brave", 3, "B"),
        entry("brave", 4, "A"),
        entry("brave", 4, "B"),
        entry("brave", 5, "A"),
        entry("brave", 5, "B"),
        entry("brave-aggr", 1, "A"),
        entry("brave-aggr", 1, "B"),
        entry("brave-aggr", 2, "A"),
        entry("brave-aggr", 2, "B"),
        entry("brave-aggr", 3, "A"),
        entry("brave-aggr", 3, "B"),
        entry("brave-aggr", 4, "A"),
        entry("brave-aggr", 4, "B"),
        entry("brave-aggr", 5, "A"),
        entry("brave-aggr", 5, "B"),
      ])
    );
  }
}
