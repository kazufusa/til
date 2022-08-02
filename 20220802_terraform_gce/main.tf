resource "google_compute_instance" "vm_from_tf" {
  name         = "vm-from-tf"
  zone         = "asia-northeast1-c"
  machine_type = "n1-standard-2"

  allow_stopping_for_update = true

  network_interface {
    network    = "custom-vpc-tf"
    subnetwork = "sub-ja"
  }

  boot_disk {
    initialize_params {
      image = "debian-10-buster-v20220719"
      size  = 20
    }
    auto_delete = false
  }

  labels = {
    "env" = "tflearning"
  }

  scheduling {
    preemptible       = true
    automatic_restart = false
  }

  service_account {
    email  = var.serviceAccount
    scopes = ["cloud-platform"]
  }

  lifecycle {
    ignore_changes = [attached_disk]
  }
}

resource "google_compute_disk" "disk-1" {
  name = "disk-1"
  size = 15
  zone = "asia-northeast1-c"
  type = "pd-ssd"
}

resource "google_compute_attached_disk" "adisk" {
  disk     = google_compute_disk.disk-1.id
  instance = google_compute_instance.vm_from_tf.id
}
