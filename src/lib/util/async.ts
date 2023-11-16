import { TimeoutError } from "./TimeoutError";

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
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Timeout after ${timeoutMs} ms`));
    }, timeoutMs);

    try {
      resolve(await promise);
    } finally {
      clearTimeout(timeoutId);
    }
  });
};

export const waitForever = async () => {
  await new Promise(() => {});
};
