import { findMinLexicographicalLCS } from "@algorithm.ts/lcs";
import { findLCSubstring } from "../util/findLCSubstring";

const FROM_YEAR = 2000;
const FROM_TIMESTAMP = +new Date(FROM_YEAR, 0, 1);
const TO_YEAR = 2050;
const TO_TIMESTAMP = +new Date(TO_YEAR, 0, 1);

const stripUnixTimestamps = (str: string): string => {
  return [...str.matchAll(/[0-9]+/g)]
    .filter((match) => {
      const matchStr = match[0];
      if (matchStr[0] !== "0") {
        const ts = +matchStr;
        return ts >= FROM_TIMESTAMP && ts < TO_TIMESTAMP;
      }
      return false;
    })
    .map((match) => {
      const start = match.index!;
      const end = start + match[0].length;
      return { start, end };
    })
    .reduce((acc, match) => {
      const offset = str.length - acc.length;
      const stripStart = match.start - offset;
      const stripEnd = match.end - offset;
      return acc.substring(0, stripStart) + acc.substring(stripEnd);
    }, str);
};

const stripTimestamps = (str: string): string => {
  return stripUnixTimestamps(str);
};

type StringPair = { str1: string; str2: string };

const stripRecurrentSubstrings = (pair: StringPair): StringPair => {
  const MAX_LENGTH = 2;

  const stripChars = (str: string, indexes: number[]): string => {
    return indexes.reduce(
      (str, index) => str.substring(0, index) + str.substring(index + 1),
      str
    );
  };

  let { str1, str2 } = pair;
  for (
    let sequence;
    (sequence = findMinLexicographicalLCS(
      str1.length,
      str2.length,
      (x, y) => str1[x] === str2[y]
    )).length > MAX_LENGTH;
    str1 = stripChars(
      str1,
      sequence.map(([x, _]) => x)
    ),
      str2 = stripChars(
        str2,
        sequence.map(([_, y]) => y)
      )
  ) {}
  return { str1, str2 };
};

const countMatchingCharacters = (str1: string, str2: string): number => {
  const { str, offset1, offset2 } = findLCSubstring(str1, str2);
  const length = str.length;
  if (length > 0) {
    return (
      length +
      countMatchingCharacters(
        str1.substring(0, offset1),
        str2.substring(0, offset2)
      ) +
      countMatchingCharacters(
        str1.substring(offset1 + length),
        str2.substring(offset2 + length)
      )
    );
  } else {
    return 0;
  }
};

const similarityScore = (str1: string, str2: string): number => {
  if (str1.length === 0 && str2.length === 0) {
    return 1;
  } else {
    return (
      (2 * countMatchingCharacters(str1, str2)) / (str1.length + str2.length)
    );
  }
};

export const significantlyDifferent = (str1: string, str2: string): boolean => {
  const SCORE_THRESHOLD = 0.66;

  if (str1 === str2) {
    return false;
  } else {
    const { str1: stripped1, str2: stripped2 } = stripRecurrentSubstrings({
      str1: stripTimestamps(str1),
      str2: stripTimestamps(str2),
    });
    return similarityScore(stripped1, stripped2) < SCORE_THRESHOLD;
  }
};
