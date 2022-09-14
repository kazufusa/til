upload:
	cd dags && gcloud composer environments storage dags import --project gcp-terraform-github --environment mycomposer --location us-central1 --source mywf.py

format:
	black ./dags
