import assert from "assert";

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

export const divide = <T>(array: T[], size: number): T[][] => {
  assert(size > 0);
  let result: T[][] = [];
  const N = array.length;
  for (let i = 0; i < N; i += size) {
    result = [...result, array.slice(i, i + size)];
  }
  return result;
};

export const mapSequentialAsync = async <A, B>(
  array: A[],
  callbackfn: (value: A, index: number, array: A[]) => Promise<B>
): Promise<B[]> => {
  let result: B[] = [];
  for (const [index, element] of array.entries()) {
    result = [...result, await callbackfn(element, index, array)];
  }
  return result;
};
