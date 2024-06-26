import { CSSI } from "../model";
import { ContextFrame } from "./ContextSet";
import { Source } from "./Flow";
import { getSiteFromHostname } from "./getSiteFromHostname";
import { syntacticallyMatchesUrl } from "./syntacticallyMatchesUrl";

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
      const { url: requestUrl } = request;
      const targetSite = getSiteFromHostname(new URL(requestUrl).hostname);

      if (!URL.canParse(requestUrl)) {
        return [];
      }
      const requestURL = new URL(requestUrl);

      const getRequestFlows = (
        source: Source,
        cssis: CSSI[]
      ): RequestFlow[] => {
        return cssis.flatMap((cssi): RequestFlow[] => {
          const { key, value } = cssi;

          return syntacticallyMatchesUrl(value, requestURL)
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
