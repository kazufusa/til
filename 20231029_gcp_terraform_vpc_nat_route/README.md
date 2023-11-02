# GCP, VPC, and Cloud NAT

To enable resources within our Virtual Private Cloud (VPC) to initiate outbound connections to the internet without receiving inbound connections, we have set up Cloud NAT. This allows our instances without public IP addresses to access external resources for updates, patches, and other critical functions, while maintaining a secure posture.

```sh
$ terraform apply -var "project_id=`gcloud config list --format 'value(core.project)' 2>/dev/null`"
```


