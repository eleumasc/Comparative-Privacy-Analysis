import { readFile } from "fs/promises";
import { AnalysisResult, SuccessfulAnalysisResult } from "../model";
import path from "path";
import assert from "assert";

export const BrowserId = ["foxhound", "firefox", "brave"] as const;

export type BrowserId = (typeof BrowserId)[number];

export const RunId = ["A", "B"] as const;

export type RunId = (typeof RunId)[number];

export interface AnalysisResultLabel {
  browserId: BrowserId;
  sequence: number;
  runId: RunId;
}

export type AnalysisResultQuery = Partial<AnalysisResultLabel>;

interface SiteAnalysisResultEntry {
  label: AnalysisResultLabel;
  result: AnalysisResult;
}

export class SiteAnalysisResult {
  constructor(
    readonly site: string,
    readonly entries: SiteAnalysisResultEntry[]
  ) {}

  all(): AnalysisResult[] {
    return this.entries.map(({ result }) => result);
  }

  select(query: AnalysisResultQuery): AnalysisResult[] {
    return this.entries
      .filter(({ label }) => {
        return (
          (typeof query.browserId === "undefined" ||
            query.browserId === label.browserId) &&
          (typeof query.sequence === "undefined" ||
            query.sequence === label.sequence) &&
          (typeof query.runId === "undefined" || query.runId === label.runId)
        );
      })
      .map(({ result }) => result);
  }

  selectSuccess(query: AnalysisResultQuery): SuccessfulAnalysisResult[] {
    return this.select(query).filter(
      (result): result is SuccessfulAnalysisResult =>
        result.status === "success"
    );
  }

  static async fromFile(outputPath: string, site: string) {
    const browserSuffixPart = (browserId: BrowserId): string => {
      switch (browserId) {
        case "foxhound":
          return "tf";
        case "firefox":
          return "ff";
        case "brave":
          return "br";
      }
    };

    const entry = async (
      browserId: BrowserId,
      sequence: number,
      runId: RunId
    ): Promise<SiteAnalysisResultEntry> => {
      const suffix = `${browserSuffixPart(browserId)}${sequence}${runId}`;
      const result = JSON.parse(
        (
          await readFile(path.join(outputPath, `${site}+${suffix}.json`))
        ).toString()
      ) as AnalysisResult;
      return { label: { browserId, sequence, runId }, result };
    };

    return new SiteAnalysisResult(
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
      ])
    );
  }
}
