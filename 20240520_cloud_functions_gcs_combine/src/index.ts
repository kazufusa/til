import * as functions from "@google-cloud/functions-framework";
import { combine } from "./gcs";

functions.http("sample", async (req, res) => {
  const { projectId: _projectId, bucketName: _bucketName, pathPrefix: _pathPrefix } = req.query
  if (!_projectId || !_bucketName || !_pathPrefix) {
    return res.status(400).send({ error: "Missing required query parameters" });
  }
  const projectId = String(_projectId)
  const bucketName = String(_bucketName)
  const pathPrefix = String(_pathPrefix)
  try {
    const combinedFileName = await combine(projectId, bucketName, pathPrefix);
    res.status(200).send({ result: combinedFileName });
  } catch (error) {
    console.error(error)
    res.status(500).send({ error: "Failed to combine files" });
  }
});
