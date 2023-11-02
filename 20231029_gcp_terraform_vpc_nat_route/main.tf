variable "project_id" {}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.51.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = "asia-northeast1"
  zone    = "asia-northeast1-a"
}

resource "google_compute_network" "train_main" {
  name                    = "train-main"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "train_main_subnet" {
  ip_cidr_range            = "10.8.0.0/28"
  name                     = "train-main-subnet"
  network                  = google_compute_network.train_main.id
  region                   = "asia-northeast1"
  private_ip_google_access = true
}

resource "google_vpc_access_connector" "train_main_connector" {
  name          = "train-main-connector"
  region        = "asia-northeast1"
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3
  subnet {
    name = google_compute_subnetwork.train_main_subnet.name
  }
}

module "cloud_nat" {
  source  = "terraform-google-modules/cloud-nat/google"
  version = "~> 5.0"

  name          = "train-main-cloud-nat"
  project_id    = var.project_id
  region        = "asia-northeast1"
  create_router = true
  router        = "train-main-nat-router"
  network       = google_compute_network.train_main.id
}

// resource "google_compute_route" "train_main_route_to_specific_ip" {
//   name             = "train-main-route-to-specific-ip"
//   dest_range       = "99.36.158.100/32"
//   network          = google_compute_network.train_main.name
//   next_hop_gateway = "default-internet-gateway"
//   priority         = 1000
// }
