function* chunkItr(arr: string[], n: number) {
  for (let i = 0; i < n; i++) {
    const start = i * arr.length / n;
    const end = (i + 1) * arr.length / n;
    yield arr.slice(start, end);
  }
}

export function chunk(arr: string[], n: number): string[][] {
  return [...(chunkItr(arr, n))];
}
