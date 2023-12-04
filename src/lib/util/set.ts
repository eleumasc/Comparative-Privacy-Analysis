export type EqualsCallback<T> = (a: T, b: T) => boolean;

export const unionSet = <T>(
  as: T[],
  bs: T[],
  equals: EqualsCallback<T> | null
): T[] => {
  if (!equals) {
    return [...new Set([...as, ...bs])];
  }
  return [...as, ...subtractSet(bs, as, equals)];
};

export const intersectSet = <T>(
  as: T[],
  bs: T[],
  equals: EqualsCallback<T> | null
): T[] => {
  if (!equals) {
    return as.filter((a) => bs.includes(a));
  }
  return as.filter((a) => bs.some((b) => equals(a, b)));
};

export const subtractSet = <T>(
  as: T[],
  bs: T[],
  equals: EqualsCallback<T> | null
): T[] => {
  if (!equals) {
    return as.filter((a) => !bs.includes(a));
  }
  return as.filter((a) => !bs.some((b) => equals(a, b)));
};
