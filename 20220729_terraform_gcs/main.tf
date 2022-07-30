resource "google_storage_bucket" "GCS1" {
  name = "tf-course-bucket-from-terraform-1484123"

  storage_class = "STANDARD"

  location = "asia-northeast1"

  labels = {
    "env" = "tf_env"
    "dep" = "complience"
  }

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 5
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  retention_policy {
    is_locked = true
    retention_period = 86400
  }
}

data "google_iam_policy" "project_owner_access" {
  binding {
    role = "roles/storage.admin"
    members = [
      "projectOwner:${var.projectID}"
    ]
  }
}

resource "google_storage_bucket_iam_policy" "project_owner_access" {
  bucket      = google_storage_bucket.GCS1.name
  policy_data = data.google_iam_policy.project_owner_access.policy_data
}

resource "google_storage_bucket_object" "picture" {
  name   = "gopher"
  bucket = google_storage_bucket.GCS1.name
  source = "gopher.jpg"

  depends_on = [google_storage_bucket_iam_policy.project_owner_access]
}
