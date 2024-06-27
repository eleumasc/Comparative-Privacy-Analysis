const MIN_LENGTH = 8;

export const syntacticallyMatchesUrl = (
  value: string,
  targetURL: URL
): boolean => {
  return (
    value.length >= MIN_LENGTH &&
    [...targetURL.searchParams].some(
      ([key, param]) =>
        (key.length >= MIN_LENGTH &&
          (key.includes(value) || value.includes(key))) ||
        (param.length >= MIN_LENGTH &&
          (param.includes(value) || value.includes(param)))
    )
  );
};
