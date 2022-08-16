preparement:
	PROJECT_ID=gcp-terraform-github sh ./preparement.sh

upload:
	gcloud composer environments storage dags import --project gcp-terraform-github --environment composer-test --location asia-northeast1 --source bq_to_other_bq.py
	gcloud composer environments storage dags import --project gcp-terraform-github --environment composer-test --location asia-northeast1 --source export_bq.sql
	gcloud composer environments storage dags import --project gcp-terraform-github --environment composer-test --location asia-northeast1 --source delete_exisiting_data.sql

.PHONY: preparement upload
