export const isNonNullable = <T>(x: T): x is NonNullable<T> => {
  return typeof x !== "undefined" && x !== null;
};
