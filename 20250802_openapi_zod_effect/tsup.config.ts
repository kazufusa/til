import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./fetch.ts", "./test.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  watch: process.env.NODE_ENV === "development",
});
