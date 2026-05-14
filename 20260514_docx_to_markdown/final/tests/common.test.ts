import { test, expect } from "bun:test";
import { loadSource, mimeFromFilename, escapeRegex } from "../lib/common";

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

test("loadSource: detects valid docx", async () => {
  const src = await loadSource("./fixtures/docx/sample.docx");
  expect(src.format).toBe("docx");
  expect(src.bytes.byteLength).toBeGreaterThan(0);
  expect(src.zip.file("word/document.xml")).not.toBeNull();
});

test("loadSource: catches content/extension mismatch", async () => {
  // Make a temp file: rename xlsx bytes to a .docx name.
  const xlsx = await Bun.file("./fixtures/xlsx/sample.xlsx").arrayBuffer();
  const tmp = "/tmp/mismatched.docx";
  await Bun.write(tmp, xlsx);
  await expect(loadSource(tmp)).rejects.toThrow(
    /content looks like \.xlsx/,
  );
});
