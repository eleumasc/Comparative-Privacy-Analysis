import { CSSI, Request } from "../model";
import { isNonNullable } from "../util/types";
import { ContextFrame } from "./ContextSet";
import { Source } from "./Flow";
import { Matching, lcsMatches } from "./Matching";
import { getSiteFromHostname } from "./getSiteFromHostname";

export interface RequestFlow {
  source: Source;
  sourceKey: string;
  targetSite: string;
}

const createMatchesRequestFlow =
  (value: string, request: Request) =>
  (matching: Matching): boolean => {
    const { url, body } = request;

    if (matching(value, url)) {
      return true;
    }

    if (body === null) {
      return false;
    }

    const { raw, formData } = body;

    if (typeof raw !== "undefined") {
      return matching(value, raw);
    } else if (typeof formData !== "undefined") {
      return formData.some(
        ({ key: entryKey, value: entryValue }) =>
          (isNonNullable(entryKey) && matching(value, entryKey)) ||
          (isNonNullable(entryValue) && matching(value, entryValue))
      );
    } else {
      return false;
    }
  };

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

          const matchesRequestFlow = createMatchesRequestFlow(value, request);

          return matchesRequestFlow(lcsMatches)
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
