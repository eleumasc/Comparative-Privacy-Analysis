export type Task = () => Promise<void>;

export default async function startTaskPool(
  tasks: Task[],
  poolSize: number
): Promise<void> {
  const it = tasks[Symbol.iterator]();

  const run = async (): Promise<void> => {
    for (let current = it.next(); !current.done; current = it.next()) {
      const { value: runTask } = current;
      await runTask();
    }
  };

  await Promise.all(
    Array.from(Array(Math.min(poolSize, tasks.length)), () => run())
  );
}

export const evaluateInTaskPool = async <T>(
  fs: (() => Promise<T>)[],
  poolSize: number
): Promise<(T | undefined)[]> => {
  const results = Array<T>(fs.length);

  await startTaskPool(
    fs.map(
      (f, i): Task =>
        async () => {
          results[i] = await f();
        }
    ),
    poolSize
  );

  return results;
};
