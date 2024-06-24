import { findLCSubstring } from "../util/findLCSubstring";

export type Matching = (source: string, target: string) => boolean;

export const substrMatches: Matching = (source, target) => {
  return target.includes(source);
};

export const lcsMatches: Matching = (source, target) => {
  const THRESHOLD = 8;

  if (source.length < THRESHOLD || target.length < THRESHOLD) {
    return false;
  }
  return findLCSubstring(source, target).str.length >= THRESHOLD;
};
