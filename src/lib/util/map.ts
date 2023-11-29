export const getOrCreateMapValue = <K, V>(
  map: Map<K, V>,
  key: K,
  createValue: () => V
): V => {
  const existing = map.get(key);
  if (typeof existing !== "undefined") {
    return existing;
  } else {
    const value = createValue();
    map.set(key, value);
    return value;
  }
};
