import { combine } from "./gcs.ts";

const projectId = Deno.env.get("GCLOUD_PROJECT_ID") ?? "";
const bucketName = Deno.env.get("BUCKET_NAME") ?? "";
const pathPrefix = Deno.env.get("PATH_PREFIX") ?? "";

console.info("Project ID:", projectId);
console.info("Bucket Name:", bucketName);
console.info("Path Prefix:", pathPrefix);

const combinedFileName = await combine(projectId, bucketName, pathPrefix);
console.info("Combined File:", combinedFileName);
