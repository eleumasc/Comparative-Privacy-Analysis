import { CSSI } from "../model";
import { significantlyDifferent } from "./significantlyDifferent";

export const cookieSwapPartyHeuristics = (
  cssis1A: CSSI[],
  cssis1B: CSSI[],
  cssis2A: CSSI[],
  decodingRequired?: boolean
): string[] => {
  const MAX_STRING_LENGTH = 16 * 1024;

  return cssis1A
    .filter(({ key: k, value: v }) => {
      if ((decodingRequired ?? false ? decodeURIComponent(v) : v).length >= 8) {
        const match1B = cssis1B.find(({ key: k1 }) => k === k1);
        const match2A = cssis2A.find(({ key: k1 }) => k === k1);
        if (typeof match1B !== "undefined" && typeof match2A !== "undefined") {
          if (v.length >= MAX_STRING_LENGTH) {
            return false;
          }
          return significantlyDifferent(v, match2A.value);
        } else {
          return false;
        }
      } else {
        return false;
      }
    })
    .map(({ key }) => key);
};
