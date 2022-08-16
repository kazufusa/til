CREATE TABLE IF NOT EXISTS gcp-terraform-github.dataset2.users
(
  ID         INT64,
  Name       STRING,
  favorite   STRING,
  created_at DATETIME
)
PARTITION BY DATE(created_at)
OPTIONS (
  partition_expiration_days=10,
  description="copied table for test"
)
