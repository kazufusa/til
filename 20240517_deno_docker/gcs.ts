import { Storage } from "@google-cloud-storage";
import { chunk } from "./chunk.ts";

const combineLimit = 32;

function ensureTrailingSlash(i: string): string {
  return i.endsWith("/") ? i : `${i}/`;
}

async function listFiles(
  storage: Storage,
  projectId: string,
  bucketName: string,
  prefix: string,
): Promise<string[]> {
  const [files] = await storage.bucket(bucketName).getFiles({ prefix });
  return files.map((v) => v.name).filter((v) => !/\/_combined[^\/]*$/.test(v));
}

async function combineRecursive(
  storage: Storage,
  projectId: string,
  bucketName: string,
  prefix: string,
  files: string[],
  combinedFileSuffix: string = "",
): Promise<string> {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0];
  const bucket = storage.bucket(bucketName);
  const destinationFileName = `${prefix}_combined${combinedFileSuffix}`;
  const sources: string[] = files.length > combineLimit
    ? await Promise.all(
      chunk(files, combineLimit).map(async (v, i) =>
        combineRecursive(
          storage,
          projectId,
          bucketName,
          prefix,
          v,
          `${combinedFileSuffix}_${i}`,
        )
      ),
    )
    : files;
  await bucket.combine(sources, destinationFileName);
  return destinationFileName;
}

export async function combine(
  projectId: string,
  bucketName: string,
  _prefix: string,
): string {
  const prefix = ensureTrailingSlash(_prefix)
  const storage: Storage = new Storage({ projectId });
  const files = await listFiles(storage, projectId, bucketName, prefix);
  return await combineRecursive(storage, projectId, bucketName, prefix, files);
}
