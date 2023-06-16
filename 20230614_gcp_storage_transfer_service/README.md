# Configure Storage Transfer Service between Cloud Storages

> Failed to obtain the location of the GCS bucket learn-gcp-test-bucket Additional details: project-xxx@storage-transfer-service.iam.gserviceaccount.com does not have storage.buckets.get access to the Google Cloud Storage bucket. Permission 'storage.buckets.get' denied on resource (or it may not exist).

## Required Roles(source bucket)

- Storage Object Viewer (roles/storage.objectViewer) / Storageオブジェクト閲覧者
- Storage Legacy Bucket Reader (roles/storage.legacyBucketReader) / Storageレガシーバケット読み取り

## Required Roles(destination bucket)

Storage Legacy Bucket Writer (roles/storage.legacyBucketWriter)

