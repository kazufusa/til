import { assertEquals } from "jsr:@std/assert";

function add(a: number, b: number): number {
  return a + b;
}

Deno.test(function addTest() {
  assertEquals(add(2, 3), 5);
});
