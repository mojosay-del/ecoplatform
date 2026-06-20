// Map с ограниченной конкуррентностью: одновременно выполняется не более `limit`
// задач, порядок результатов сохраняется. Нужен для фоновых рассылок/сканов, где
// последовательный `for…await` слишком медленный, а unbounded `Promise.all`
// рискует исчерпать пул соединений к БД при росте данных.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("mapWithConcurrency: limit must be a positive integer");
  }

  const results = new Array<R>(items.length);
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!, index);
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}
