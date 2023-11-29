import assert from "assert";
import Completer from "../util/Completer";
import { divide } from "../util/array";
import { getOrCreateMapValue } from "../util/map";
import { Runner, RunnerContext, SiteEntry } from "./Runner";
import { SessionEntry } from "./Session";

export interface DefaultRunnerOptions {
  concurrencyLevel: number;
  coincidenceLevel: number;
  batchSize: number;
}

interface SiteAnalysis {
  id: number;
  siteEntry: SiteEntry;
  notify: () => void;
  isCompleted: Promise<void>;
}

interface Batch {
  siteAnalyses: SiteAnalysis[];
  sessionEntry: SessionEntry;
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

    const generateBatches = function* (
      siteAnalyses: SiteAnalysis[],
      sessionEntries: SessionEntry[]
    ): Generator<Batch, void> {
      for (const batchSiteAnalyses of divide(siteAnalyses, batchSize)) {
        for (const sessionEntry of sessionEntries) {
          yield { siteAnalyses: batchSiteAnalyses, sessionEntry };
        }
      }
    };

    const sessionLockRefs = new Map<string, { lock: Promise<void> | null }>();
    const processNextBatch = async (): Promise<boolean> => {
      const { done: noMoreBatches, value: batch } = batchesGenerator.next();
      if (noMoreBatches) {
        return false;
      }

      const { siteAnalyses, sessionEntry } = batch;

      const sessionLockRef = getOrCreateMapValue(
        sessionLockRefs,
        sessionEntry.name,
        () => ({ lock: null })
      );
      while (sessionLockRef.lock !== null) {
        await sessionLockRef.lock;
      }
      const lockCompleter = new Completer<void>();
      sessionLockRef.lock = lockCompleter.promise;

      for (const siteAnalysis of siteAnalyses) {
        await enqueueAnalysis(siteAnalysis, sessionEntry);
      }
      await sessionEntry.controller.terminate();

      sessionLockRef.lock = null;
      lockCompleter.complete();

      return true;
    };

    const siteAnalysisLockSets = new Map<number, Set<Promise<void>>>();
    const enqueueAnalysis = async (
      siteAnalysis: SiteAnalysis,
      sessionEntry: SessionEntry
    ): Promise<void> => {
      const { id: siteAnalysisId, siteEntry } = siteAnalysis;

      const siteAnalysisLockSet = getOrCreateMapValue(
        siteAnalysisLockSets,
        siteAnalysisId,
        () => new Set()
      );

      const canCoincide = () => siteAnalysisLockSet.size < coincidenceLevel;
      while (!canCoincide()) {
        await Promise.race([...siteAnalysisLockSet]);
      }

      const lockCompleter = new Completer<void>();
      const lock = lockCompleter.promise;
      siteAnalysisLockSet.add(lock);

      await context.runAnalysis(siteAnalysisId, siteEntry, sessionEntry);
      siteAnalysis.notify();

      siteAnalysisLockSet.delete(lock);
      lockCompleter.complete();
    };

    const expectedNotifiedCount = sessionEntries.length;
    const siteAnalyses = siteEntries.map(
      (siteEntry, siteAnalysisId): SiteAnalysis => {
        const completer = new Completer<void>();

        let notNotifiedCount = expectedNotifiedCount;
        const notify = async (): Promise<void> => {
          notNotifiedCount -= 1;
          if (notNotifiedCount === 0) {
            await context.endSiteAnalysis(siteAnalysisId, siteEntry);
            completer.complete();
          }
        };

        return {
          id: siteAnalysisId,
          siteEntry,
          notify,
          isCompleted: completer.promise,
        };
      }
    );
    const batchesGenerator = generateBatches(siteAnalyses, sessionEntries);
    const workers = Array.from({ length: concurrencyLevel }, async () => {
      while (await processNextBatch());
    });
    await Promise.all(workers);
    await Promise.all(
      siteAnalyses.map((siteAnalysis) => siteAnalysis.isCompleted)
    );
  }
}
