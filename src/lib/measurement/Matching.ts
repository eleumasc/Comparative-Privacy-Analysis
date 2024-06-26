import { findLCSubstring } from "../util/findLCSubstring";

export type Matching = (source: string, target: string) => boolean;

export const substrMatches: Matching = (source, target) => {
  return target.includes(source);
};

const LCS_THRESHOLD = 8;

export const lcsMatches: Matching = (source, target) => {
  if (source.length < LCS_THRESHOLD || target.length < LCS_THRESHOLD) {
    return false;
  }
  return findLCSubstring(source, target).str.length >= LCS_THRESHOLD;
};

const DOUBLE_SUBSTR_THRESHOLD = 8;

export const doubleSubstrMatches: Matching = (source, target) => {
  return (
    source.length >= DOUBLE_SUBSTR_THRESHOLD &&
    (target.includes(source) || source.includes(target))
  );
};
