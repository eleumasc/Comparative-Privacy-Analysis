import { CSSI } from "../model";
import { ContextFrame } from "./ContextSet";
import { Source } from "./Flow";
import { getSiteFromHostname } from "./getSiteFromHostname";
import { syntacticallyMatchesUrl } from "./syntacticallyMatchesUrl";

export interface MatchingFlow {
  source: Source;
  sourceKey: string;
  targetSite: string;
}

export const getFrameMatchingFlows = (
  contextFrames: ContextFrame[]
): MatchingFlow[] => {
  return contextFrames.flatMap((contextFrame) => {
    const { frame, requests } = contextFrame;
    const { cookies, storageItems } = frame;

    return requests.flatMap((request): MatchingFlow[] => {
      const { url: requestUrl } = request;
      const targetSite = getSiteFromHostname(new URL(requestUrl).hostname);

      if (!URL.canParse(requestUrl)) {
        return [];
      }
      const requestURL = new URL(requestUrl);

      const getMatchingFlows = (
        source: Source,
        cssis: CSSI[]
      ): MatchingFlow[] => {
        return cssis
          .filter(({ value }) => syntacticallyMatchesUrl(value, requestURL))
          .map(({ key }): MatchingFlow => {
            return { source, sourceKey: key, targetSite };
          });
      };

      return [
        ...getMatchingFlows("cookie", cookies),
        ...getMatchingFlows("storageItem", storageItems),
      ];
    });
  });
};

export const equalsMatchingFlow = (
  x: MatchingFlow,
  y: MatchingFlow
): boolean => {
  return (
    x.source === y.source &&
    x.sourceKey === y.sourceKey &&
    x.targetSite === y.targetSite
  );
};
