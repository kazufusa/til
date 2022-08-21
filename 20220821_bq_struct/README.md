# BigQuery and struct

## preparements

```sh
$ gcloud auth application-default login
```

## execution

```sh
$ bat ./test.sql
───────┬───────────────────────────────────────────────────────────────
       │ File: ./test.sql
───────┼───────────────────────────────────────────────────────────────
   1   │ WITH data as (
   2   │   SELECT
   3   │     1 as A,
   4   │     2 as B,
   5   │     '3' as C
   6   │ )
   7   │ SELECT
   8   │   current_date() as date,
   9   │   STRUCT(
  10   │     data.A as data_a,
  11   │     data.B as data_b,
  12   │     data.C as data_c
  13   │   ) as data
  14   │ FROM data;
───────┴───────────────────────────────────────────────────────────────

$ bq query --nouse_legacy_sql < test.sql
+------------+------------------------------------------+
|    date    |                   data                   |
+------------+------------------------------------------+
| 2022-08-21 | {"data_a":"1","data_b":"2","data_c":"3"} |
+------------+------------------------------------------+

$ python test.py
Row((datetime.date(2022, 8, 21), {'data_a': 1, 'data_b': 2, 'data_c': '3'}), {'date': 0, 'data': 1})
1
2
3
None
```
