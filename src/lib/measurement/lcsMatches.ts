import { findLCSubstring } from "../util/findLCSubstring";

const MIN_LENGTH = 8;

export const lcsMatches = (source: string, target: string): boolean => {
  if (source.length < MIN_LENGTH || target.length < MIN_LENGTH) {
    return false;
  }
  return findLCSubstring(source, target).str.length >= MIN_LENGTH;
};
