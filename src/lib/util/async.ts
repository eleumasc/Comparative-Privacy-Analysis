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

export type PromiseResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: any };

export const settleWithConcurrencyLimit = async <T>(
  promiseFactories: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<PromiseResult<T>[]> => {
  const results: PromiseResult<T>[] = Array(promiseFactories.length);
  let currentIndex = 0;

  const processNext = async () => {
    const index = currentIndex++;
    if (index >= promiseFactories.length) return;

    const promiseFactory = promiseFactories[index];
    try {
      const result = await promiseFactory();
      results[index] = { status: "fulfilled", value: result };
    } catch (error) {
      results[index] = { status: "rejected", reason: error };
    } finally {
      await processNext();
    }
  };

  await Promise.all(
    new Array(Math.min(concurrencyLimit, promiseFactories.length))
      .fill(undefined)
      .map(async () => await processNext())
  );

  return results;
};
