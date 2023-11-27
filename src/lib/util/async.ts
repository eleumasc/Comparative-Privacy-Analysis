export const asyncDelay = (timeoutMs: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });
};

export const timeBomb = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Promise timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      const clearAndReject = (error: any) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      promise.then(clearAndReject, clearAndReject);
    }),
  ]);
};

export const waitForever = async () => {
  await new Promise(() => {});
};

export const allWithConcurrencyLimit = async <T>(
  promiseFactories: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<T[]> => {
  const results: T[] = Array(promiseFactories.length);
  let currentIndex = 0;
  let rejected = false;

  const processNext = async () => {
    if (rejected) return;

    const index = currentIndex++;
    if (index >= promiseFactories.length) return;

    const promiseFactory = promiseFactories[index];
    try {
      results[index] = await promiseFactory();
      await processNext();
    } catch (e) {
      rejected = true;
      throw e;
    }
  };

  const jobs = new Array(Math.min(concurrencyLimit, promiseFactories.length))
    .fill(undefined)
    .map(() => processNext());
  try {
    await Promise.all(jobs);
    return results;
  } finally {
    await Promise.allSettled(jobs);
  }
};
