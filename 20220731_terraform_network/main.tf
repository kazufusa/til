resource "google_compute_network" "auto-vpc-tf" {
  name                    = "auto-vpc-tf"
  auto_create_subnetworks = true
}


resource "google_compute_network" "custom-vpc-tf" {
  name                    = "custom-vpc-tf"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "sub-ja" {
  name                     = "sub-ja"
  network                  = google_compute_network.custom-vpc-tf.id
  ip_cidr_range            = "10.1.0.0/24"
  region                   = "asia-northeast1"
  private_ip_google_access = true

}

resource "google_compute_firewall" "allow-icmp" {
  name    = "allow-icmp"
  network = google_compute_network.custom-vpc-tf.id
  allow {
    protocol = "icmp"
  }
  source_ranges =  [var.ip]
}

output "auto" {
  value = google_compute_network.auto-vpc-tf.id
}


output "costom" {
  value = google_compute_network.custom-vpc-tf.id
}
