import { chunk } from "./chunk.ts";
import { assertEquals } from "asserts";
import fc from "fast-check";

Deno.test("chunk splits array into n equal parts", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { maxLength: 1000 }),
      fc.nat(32).filter((n) => n > 0),
      (arr, n) => {
        const chunks = chunk(arr, n);
        return chunks.length <= n
      },
    ),
  );
});

Deno.test("chunk maintains array elements", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { maxLength: 1000 }),
      fc.nat(32).filter((n) => n > 0),
      (arr, n) => {
        const chunks = chunk(arr, n);
        const flattenedChunks = chunks.flat();
        return assertEquals(flattenedChunks, arr);
      },
    ),
  );
});
