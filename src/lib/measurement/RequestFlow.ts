import { CSSI } from "../model";
import { ContextFrame } from "./ContextSet";
import { Source } from "./Flow";
import { Matching, doubleSubstrMatches } from "./Matching";
import { getSiteFromHostname } from "./getSiteFromHostname";

export interface RequestFlow {
  source: Source;
  sourceKey: string;
  targetSite: string;
}

export const getFrameRequestFlows = (
  contextFrames: ContextFrame[]
): RequestFlow[] => {
  return contextFrames.flatMap((contextFrame) => {
    const { frame, requests } = contextFrame;
    const { cookies, storageItems } = frame;

    return requests.flatMap((request): RequestFlow[] => {
      const { url } = request;
      const targetSite = getSiteFromHostname(new URL(url).hostname);

      const getRequestFlows = (
        source: Source,
        cssis: CSSI[]
      ): RequestFlow[] => {
        return cssis.flatMap((cssi): RequestFlow[] => {
          const { key, value } = cssi;

          const matchesRequestFlow = (matching: Matching): boolean => {
            const { url } = request;
            return matching(value, url);
          };

          return matchesRequestFlow(doubleSubstrMatches)
            ? [{ source, sourceKey: key, targetSite: targetSite }]
            : [];
        });
      };

      return [
        ...getRequestFlows("cookie", cookies),
        ...getRequestFlows("storageItem", storageItems),
      ];
    });
  });
};

export const equalsRequestFlow = (x: RequestFlow, y: RequestFlow): boolean => {
  return (
    x.source === y.source &&
    x.sourceKey === y.sourceKey &&
    x.targetSite === y.targetSite
  );
};
