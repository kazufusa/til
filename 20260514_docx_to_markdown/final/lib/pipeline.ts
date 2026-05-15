// Shared conversion pipeline. The only thing that changes between the real
// CLI run, `--no-llm` debug runs, and golden-file tests is the `describe`
// callback used to caption each image — everything else is identical.

import { loadSource } from "./common";
import { runPandocWasm } from "./pandoc";
import { spliceXlsxImages } from "./xlsx";
import { injectImageDescriptions } from "./output";
import type { Image } from "./types";

export type Describe = (images: Image[]) => Promise<Map<string, string>>;

// Deterministic dummy describer. Same captions as `convert.ts --no-llm`.
// Used by the golden-file tests so they never need network or env vars.
export const dummyDescribe: Describe = async (images) =>
  new Map(images.map((img) => [img.id, `(画像: ${img.filename})`]));

export async function runPipeline(
  inputPath: string,
  describe: Describe,
): Promise<string> {
  const source = await loadSource(inputPath);
  const pandoc = await runPandocWasm(source);
  const spliced =
    source.format === "xlsx"
      ? await spliceXlsxImages(pandoc.markdown, source)
      : null;
  const markdown = spliced?.markdown ?? pandoc.markdown;
  const images: Image[] = spliced
    ? [...pandoc.images, ...spliced.images]
    : pandoc.images;
  const descMap = await describe(images);
  return injectImageDescriptions(markdown, images, descMap);
}
