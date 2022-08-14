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

## export usrs to DATASET_US
# bq load \
#   --source_format=CSV \
#   --skip_leading_rows=1 \
#   ${PROJECT_ID}:${DATASET_US}.users \
#   ./users.csv \
#   ID:INT64,Name:STRING,favorite:STRING,created_at:DATETIME
#

# bq rm ${PROJECT_ID}:${DATASET_US}.ids

## export ids to DATASET_ASIA
# bq load \
#   --source_format=CSV \
#   --skip_leading_rows=1 \
#   ${PROJECT_ID}:${DATASET_TOKYO}.ids \
#   ./ids.csv \
#   ID:INT64

bq query --nouse_legacy_sql "
SELECT * FROM \`${PROJECT_ID}.${DATASET_US}.users\`
"

bq query --nouse_legacy_sql "
SELECT * FROM \`${PROJECT_ID}.${DATASET_TOKYO}.ids\`
"

## Try to join users and ids and failed.
bq query --nouse_legacy_sql "
SELECT 
  *
FROM
  \`${PROJECT_ID}.${DATASET_TOKYO}.ids\` ids
  LEFT JOIN \`${PROJECT_ID}.${DATASET_US}.users\` users ON ids.id = users.id
;
"
# BigQuery error in query operation: Error processing job 'terraform-
# gcp-357414:bqjob_r4de484e95614730a_000001829c6112fb_1': Not found: Dataset gcp-
# terraform-github:dataset2 was not found in location us-west1

## Export ids to GCS on US
bq query --nouse_legacy_sql "
EXPORT DATA OPTIONS( \
  uri='gs://${}/export/*.csv', \
  format='CSV',
  overwrite=true,
  header=true,
  field_delimiter=','
) AS
SELECT * FROM \`${PROJECT_ID}.${DATASET_TOKYO}.ids\` ids;
"
