DELETE FROM `gcp-terraform-github.dataset2.users`
WHERE DATE(created_at) = "{{ execution_date.subtract(days=1) | ds }}"
;
