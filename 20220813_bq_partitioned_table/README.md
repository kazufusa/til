# [BigQuery] Learn Partitioned Table

1. `EXPORT DATA` can export BigQuery across locations.

## references

- https://zenn.dev/ykdev/articles/c98bbd8f87a9d7
- https://codelabs.developers.google.com/codelabs/bigquery-cli

## create dataset

```sh
bq --location=us-west1 mk \
    --dataset \
    --default_table_expiration=3600 \
    --description="DESCRIPTION" \
    ${PROJECT_ID}:dataset
```

## create table

```sh
bq mk \
--table \
--location us-west1 \
--expiration 3600 \
--description "This is my test table" \
--time_partitioning_field created_at \
--time_partitioning_type DAY \
${PROJECT_ID}:dataset.users \
ID:STRING,Name:STRING,favorite:STRING,created_at:DATETIME
```

```sh
bq load \
  --source_format=CSV \
  --skip_leading_rows=1 \
  ${PROJECT_ID}:dataset.users \
  ./users.csv \
  ID:STRING,Name:STRING,favorite:STRING,created_at:DATETIME
```

## Query the data

```
❯ bq query --nouse_legacy_sql "SELECT * FROM \`${PROJECT_ID}.dataset.users\`"
+------+-----------+----------+----------------------------+
|  ID  |   Name    | favorite |         created_at         |
+------+-----------+----------+----------------------------+
| 1001 | 田中 太郎 | サッカー | 2020-12-02T10:05:04.971000 |
| 1003 | 山田 隆史 | テニス   | 2021-05-04T21:35:11.071000 |
| 1002 | 鈴木 一郎 | 野球     | 2021-02-03T14:45:44.811000 |

❯ bq query --nouse_legacy_sql "SELECT * FROM \`${PROJECT_ID}.dataset.users\` WHERE created_at < \"2020-12-31\""
+------+-----------+----------+----------------------------+
|  ID  |   Name    | favorite |         created_at         |
+------+-----------+----------+----------------------------+
| 1001 | 田中 太郎 | サッカー | 2020-12-02T10:05:04.971000 |
+------+-----------+----------+----------------------------+
```

## Export to GCS

```sh
❯ gsutil mb -p ${PROJECT_ID} -l asia-northeast1 gs://bigquery-export-$(openssl rand -hex 8)
Creating gs://bigquery-export-7825b675403f1831/...

❯ bq query --nouse_legacy_sql "EXPORT DATA OPTIONS( \
  uri='gs://bigquery-export-7825b675403f1831/export/*.csv', \
  format='CSV', \
  overwrite=true, \
  header=true, \
  field_delimiter=',' \
) AS \
SELECT * FROM \`${PROJECT_ID}.dataset.users\` WHERE created_at < \"2020-12-31\""
Waiting on bqjob_r699a69199f7a31bc_0000018297a17abc_1 ... (0s) Current status: DONE
```

## create dataset and table in another location

```sh
bq --location=asia-northeast1 mk \
    --dataset \
    --default_table_expiration=3600 \
    --description="DESCRIPTION" \
    ${PROJECT_ID}:dataset2

bq mk \
--table \
--location asia-northeast1 \
--expiration 3600 \
--description "This is my test table" \
--time_partitioning_field created_at \
--time_partitioning_type DAY \
${PROJECT_ID}:dataset2.users \
ID:STRING,Name:STRING,favorite:STRING,created_at:DATETIME

bq load \
  --source_format=CSV \
  --skip_leading_rows=1 \
  ${PROJECT_ID}:dataset2.users \
  gs://bigquery-export-7825b675403f1831/export/000000000000.csv \
  ID:STRING,Name:STRING,favorite:STRING,created_at:DATETIME
```

## cleanup

```sh
$ bq rm -r dataset
```
