import { Storage } from "@google-cloud-storage";
import { combine } from "./gcs.ts";

const projectId = Deno.env.get("GCLOUD_PROJECT_ID") ?? "";
const bucketName = Deno.env.get("BUCKET_NAME") ?? "";
const pathPrefix = Deno.env.get("PATH_PREFIX") ?? "";

console.info(projectId, bucketName, pathPrefix)
console.info(await combine(projectId, bucketName, pathPrefix))
