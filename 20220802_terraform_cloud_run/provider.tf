terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      version = "4.29.0"
    }
  }
}

provider "google" {
  project     = var.gcp_project_id
  region      = "asia-northeast1"
  zone        = "asia-northeast1-a"
  # set credentials to connect terraform with GCP with service account
  # credentials = "tmp/keys.json"
}
