export const distinct = <T>(
  array: T[],
  equals?: (x: T, y: T) => boolean
): T[] => {
  if (typeof equals === "undefined") {
    return [...new Set(array)];
  }
  let result: T[] = [];
  for (const element of array) {
    if (!result.some((e) => equals(e, element))) {
      result = [...result, element];
    }
  }
  return result;
};
