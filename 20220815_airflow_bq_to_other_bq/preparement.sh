#!/bin/sh

set -Ceux

# BQ datasets
# 1. dataset(us west1)
# 2. dataset2(asia-northeast1)
#
# GCS buckets
# 1. bigquery-export-608e6a2be981e351 (us)
# 2. bigquery-export-7825b675403f1831 (asia-northeast1)

export DATASET_US=dataset
export DATASET_TOKYO=dataset2
export GCS_US=bigquery-export-608e6a2be981e351
export GCS_TOKYO=bigquery-export-7825b675403f1831

bq rm --force ${PROJECT_ID}:${DATASET_US}.users

## export usrs to DATASET_US
bq load \
  --source_format=CSV \
  --skip_leading_rows=1 \
  --time_partitioning_field created_at \
  --time_partitioning_type DAY \
  ${PROJECT_ID}:${DATASET_US}.users \
  ./users.csv \
  ID:INT64,Name:STRING,favorite:STRING,created_at:DATETIME


bq query --nouse_legacy_sql --dry_run "
SELECT * FROM \`${PROJECT_ID}.${DATASET_US}.users\`
"

bq query --nouse_legacy_sql --dry_run "
SELECT * FROM \`${PROJECT_ID}.${DATASET_US}.users\` WHERE created_at < \"2022-08-12\"
"
