EXPORT DATA OPTIONS (
    uri="gs://bigquery-export-7825b675403f1831/export/{{ execution_date.subtract(days=1) | ds }}/*.gz",
    format=CSV,
    compression=GZIP,
    overwrite=true,
    header=true,
    field_delimiter=","
) AS
SELECT * FROM `gcp-terraform-github.dataset.users` WHERE DATE(created_at) = "{{ execution_date.subtract(days=1) | ds }}"
;
