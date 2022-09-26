# #### Table-level data quality check
# Run a row count check to ensure all data was uploaded to BigQuery properly.
# """
check_bq_row_count = BigQueryValueCheckOperator(
    task_id="check_row_count",
    sql=f"SELECT COUNT(*) FROM {DATASET}.{TABLE}",
    pass_value=9,
    use_legacy_sql=False,
)
