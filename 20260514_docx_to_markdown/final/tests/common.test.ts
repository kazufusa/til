import { test, expect, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSource, mimeFromFilename, escapeRegex } from "../lib/common";

const tmpDir = await mkdtemp(join(tmpdir(), "office2md-test-"));
afterAll(() => rm(tmpDir, { recursive: true, force: true }));

test("mimeFromFilename: extension lookup", () => {
  expect(mimeFromFilename("a.PNG")).toBe("image/png");
  expect(mimeFromFilename("foo/bar/x.jpeg")).toBe("image/jpeg");
  expect(mimeFromFilename("noext")).toBe("application/octet-stream");
  expect(mimeFromFilename("x.unknown")).toBe("application/octet-stream");
});

test("escapeRegex: escapes regex metacharacters", () => {
  expect(escapeRegex("a.b")).toBe("a\\.b");
  expect(escapeRegex("(x)+")).toBe("\\(x\\)\\+");
});

test("loadSource: rejects wrong extension", async () => {
  await expect(loadSource("/etc/hostname")).rejects.toThrow(/unsupported extension/);
});

test("loadSource: rejects missing file", async () => {
  await expect(loadSource("./fixtures/docx/nope.docx")).rejects.toThrow(/not found/);
});

test("loadSource: catches content/extension mismatch", async () => {
  // xlsx bytes renamed to .docx should fail validation with a clear message.
  const xlsx = await Bun.file("./fixtures/xlsx/example.xlsx").arrayBuffer();
  const mismatched = join(tmpDir, "mismatched.docx");
  await Bun.write(mismatched, xlsx);
  await expect(loadSource(mismatched)).rejects.toThrow(/content looks like \.xlsx/);
});
