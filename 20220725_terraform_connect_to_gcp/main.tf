terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.29.0"
    }
  }
}

provider "google" {
  project     = var.projectID
  region      = "asia-northeast1"
  zone        = "asia-northeast1-a"
  # set credentials to connect terraform with GCP with service account
  # credentials = "tmp/keys.json"
}

resource "google_storage_bucket" "GCS1" {
  name     = "bucket-from-tf-cli-1484123"
  location = "asia-northeast1"
}
