preparement:
	PROJECT_ID=gcp-terraform-github sh ./preparement.sh

upload:
	gcloud composer environments storage dags import --project gcp-terraform-github --environment composer-test --location asia-northeast1 --source bq_to_other_bq.py

.PHONY: preparement upload
