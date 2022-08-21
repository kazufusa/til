WITH data as (
  SELECT
    1 as A,
    2 as B,
    '3' as C
)
SELECT
  current_date() as date,
  STRUCT(
    data.A as data_a,
    data.B as data_b,
    data.C as data_c
  ) as data
FROM data;
