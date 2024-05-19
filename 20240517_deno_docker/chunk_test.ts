import { chunk } from "./chunk.ts";
import { assertEquals } from "https://deno.land/std@0.140.0/testing/asserts.ts";
import fc from "https://esm.sh/fast-check@3.0.0";

Deno.test("chunk splits array into n equal parts", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { maxLength: 1000 }),
      fc.nat(32).filter((n) => n > 0),
      (arr, n) => {
        const chunks = chunk(arr, n);
        const chunkLengths = chunks.map((chunk) => chunk.length);
        const expectedLength = Math.ceil(arr.length / n);
        return chunkLengths.every((length) => length <= expectedLength);
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
