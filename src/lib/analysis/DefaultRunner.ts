import assert from "assert";
import { divide } from "../util/array";
import { Runner, RunnerContext, SiteEntry } from "./Runner";
import { SessionEntry } from "./Session";

export interface DefaultRunnerOptions {
  concurrencyLevel: number;
  coincidenceLevel: number;
  batchSize: number;
}

interface SiteStatus {
  siteId: number;
  siteEntry: SiteEntry;
  completionCount: number;
}

interface SessionStatus {
  sessionEntry: SessionEntry;
  nextBatchIndex: number;
}

export class DefaultRunner implements Runner {
  constructor(readonly options: DefaultRunnerOptions) {
    const { concurrencyLevel, coincidenceLevel, batchSize } = this.options;
    assert(concurrencyLevel > 0);
    assert(coincidenceLevel > 0);
    assert(batchSize > 0);
    assert(coincidenceLevel <= concurrencyLevel);
  }

  async runAnalysis(
    siteEntries: SiteEntry[],
    sessionEntries: SessionEntry[],
    context: RunnerContext
  ): Promise<void> {
    const { concurrencyLevel, coincidenceLevel, batchSize } = this.options;

    const batches = divide(
      siteEntries.map(
        (siteEntry): SiteStatus => ({
          siteId: siteEntry.siteIndex,
          siteEntry,
          completionCount: 0,
        })
      ),
      batchSize
    );
    const totalBatches = batches.length;
    const sessionStatuses = sessionEntries.map(
      (sessionEntry): SessionStatus => ({
        sessionEntry,
        nextBatchIndex: 0,
      })
    );
    const totalSessions = sessionEntries.length;
    const effectiveConcurrencyLevel = Math.min(concurrencyLevel, totalSessions);

    const processBatch = async (
      batch: SiteStatus[],
      sessionEntry: SessionEntry
    ) => {
      for (const siteStatus of batch) {
        const { siteId, siteEntry } = siteStatus;

        await context.runAnalysis(siteId, siteEntry, sessionEntry);

        siteStatus.completionCount += 1;
        if (siteStatus.completionCount === totalSessions) {
          await context.endSiteAnalysis(siteId, siteEntry);
        }
      }
    };

    let lastUsedSessionEntries: SessionEntry[] = [];
    for (
      let aliveSessionStatuses: SessionStatus[];
      (aliveSessionStatuses = sessionStatuses.filter(
        (sessionStatus) => sessionStatus.nextBatchIndex < totalBatches
      )).length > 0;

    ) {
      aliveSessionStatuses.sort((a, b) => a.nextBatchIndex - b.nextBatchIndex);

      let runningProcesses: Promise<void>[] = [];
      let usedSessionEntries: SessionEntry[] = [];
      const batchCoincidenceMap = new Map<number, number>();
      for (
        let i = 0;
        i < Math.min(effectiveConcurrencyLevel, aliveSessionStatuses.length);
        i += 1
      ) {
        const sessionStatus = aliveSessionStatuses[i];
        const { sessionEntry, nextBatchIndex } = sessionStatus;

        const batchCoincidence = batchCoincidenceMap.get(nextBatchIndex) ?? 0;
        if (batchCoincidence === coincidenceLevel) {
          continue;
        }
        batchCoincidenceMap.set(nextBatchIndex, batchCoincidence + 1);

        const batch = batches[nextBatchIndex];
        sessionStatus.nextBatchIndex += 1;
        runningProcesses = [
          ...runningProcesses,
          processBatch(batch, sessionEntry),
        ];
        usedSessionEntries = [
          ...usedSessionEntries,
          sessionStatus.sessionEntry,
        ];
      }

      await Promise.all(
        lastUsedSessionEntries
          .filter(
            (sessionStatus) => !usedSessionEntries.includes(sessionStatus)
          )
          .map((sessionEntry) => sessionEntry.controller.terminate())
      );

      await Promise.all(runningProcesses);

      lastUsedSessionEntries = usedSessionEntries;
    }

    await Promise.all(
      sessionEntries.map((sessionEntry) => sessionEntry.controller.terminate())
    );
  }
}
