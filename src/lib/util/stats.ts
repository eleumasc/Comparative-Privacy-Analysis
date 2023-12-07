export const sum = (values: number[]): number => {
  return values.reduce((acc, value) => acc + value, 0);
};

export const countIfNonZero = (values: number[]): number => {
  return values.reduce((acc, value) => acc + (value > 0 ? 1 : 0), 0);
};

export const bothSumCount = (values: number[]): [number, number] => {
  return [sum(values), countIfNonZero(values)];
};
