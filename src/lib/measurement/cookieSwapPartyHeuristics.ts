import { KeyValuePair } from "../analysis/model";
import { significantlyDifferent } from "./significantlyDifferent";

export const cookieSwapPartyHeuristics = (
  pairs1A: KeyValuePair[],
  pairs1B: KeyValuePair[],
  pairs2A: KeyValuePair[],
  decodingRequired?: boolean
): string[] => {
  const MAX_STRING_LENGTH = 16 * 1024;

  return pairs1A
    .filter(({ key: k, value: v }) => {
      if ((decodingRequired ?? false ? decodeURIComponent(v) : v).length >= 8) {
        const match1B = pairs1B.find(({ key: k1 }) => k === k1);
        const match2A = pairs2A.find(({ key: k1 }) => k === k1);
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
