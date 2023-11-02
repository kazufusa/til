output "train_main_network_id" {
  value       = google_compute_network.train_main.id
  description = "The ID of the train-main network."
}

output "train_main_network_self_link" {
  value       = google_compute_network.train_main.self_link
  description = "The self link of the train-main network."
}

output "train_main_subnet_id" {
  value       = google_compute_subnetwork.train_main_subnet.id
  description = "The ID of the train-main subnet."
}

output "train_main_subnet_ip_cidr_range" {
  value       = google_compute_subnetwork.train_main_subnet.ip_cidr_range
  description = "The IP CIDR range of the train-main subnet."
}

output "train_main_subnet_self_link" {
  value       = google_compute_subnetwork.train_main_subnet.self_link
  description = "The self link of the train-main subnet."
}

output "train_main_subnet_private_ip_google_access" {
  value       = google_compute_subnetwork.train_main_subnet.private_ip_google_access
  description = "Whether the train-main subnet has Google managed private access enabled."
}
