import Completer from "../util/Completer";
import { divide } from "../util/array";
import { getOrCreateMapValue } from "../util/map";
import { SessionEntry } from "./Session";

export interface SchedulingContext {
  runAnalysis(
    siteAnalysisId: number,
    siteDetail: SiteDetail,
    sessionEntry: SessionEntry
  ): Promise<void>;
  endSiteAnalysis(
    siteAnalysisId: number,
    siteDetail: SiteDetail
  ): Promise<void>;
}

export interface SiteDetail {
  site: string;
  siteIndex: number;
  url: string;
}

interface SiteAnalysis {
  id: number;
  siteDetail: SiteDetail;
  notify: () => void;
  isCompleted: Promise<void>;
}

interface Batch {
  siteAnalyses: SiteAnalysis[];
  sessionEntry: SessionEntry;
}

export const schedule = async (
  siteList: string[],
  sessionEntries: SessionEntry[],
  context: SchedulingContext,
  concurrencyLevel: number,
  coincidenceLevel: number,
  batchSize: number
) => {
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

  const processNextBatch = async (): Promise<boolean> => {
    const { done: noMoreBatches, value: batch } = batchesGenerator.next();
    if (noMoreBatches) {
      return false;
    }

    const { siteAnalyses, sessionEntry } = batch;
    for (const siteAnalysis of siteAnalyses) {
      // run batch
      await enqueueAnalysis(siteAnalysis, sessionEntry);
    }

    await sessionEntry.controller.terminate(); // end batch

    return true;
  };

  const siteAnalysisLockSets = new Map<number, Set<Promise<void>>>();
  const enqueueAnalysis = async (
    siteAnalysis: SiteAnalysis,
    sessionEntry: SessionEntry
  ): Promise<void> => {
    const { id: siteAnalysisId, siteDetail } = siteAnalysis;

    const siteAnalysisLockSet = getOrCreateMapValue(
      siteAnalysisLockSets,
      siteAnalysisId,
      () => new Set()
    );

    const canCoincide = () => siteAnalysisLockSet.size < coincidenceLevel;
    while (!canCoincide()) {
      await Promise.race([...siteAnalysisLockSet]);
    }

    const siteAnalysisLockCompleter = new Completer<void>();
    const siteAnalysisLock = siteAnalysisLockCompleter.promise;
    siteAnalysisLockSet.add(siteAnalysisLock);
    await context.runAnalysis(siteAnalysisId, siteDetail, sessionEntry); // run analysis
    siteAnalysis.notify();
    siteAnalysisLockSet.delete(siteAnalysisLock);
    siteAnalysisLockCompleter.complete();
  };

  const expectedNotifiedCount = sessionEntries.length;
  const siteAnalyses = siteList.map((site, siteIndex): SiteAnalysis => {
    const siteAnalysisId = siteIndex;
    const siteDetail: SiteDetail = { site, siteIndex, url: `http://${site}/` };

    const completer = new Completer<void>();

    let notNotifiedCount = expectedNotifiedCount;
    const notify = async (): Promise<void> => {
      notNotifiedCount -= 1;
      if (notNotifiedCount === 0) {
        await context.endSiteAnalysis(siteAnalysisId, siteDetail); // end site analysis
        completer.complete();
      }
    };

    return {
      id: siteAnalysisId,
      siteDetail,
      notify,
      isCompleted: completer.promise,
    };
  });
  const batchesGenerator = generateBatches(siteAnalyses, sessionEntries);
  const workers = Array.from({ length: concurrencyLevel }, async () => {
    while (await processNextBatch());
  });
  await Promise.all(workers);
  await Promise.all(
    siteAnalyses.map((siteAnalysis) => siteAnalysis.isCompleted)
  );
};
