from datetime import datetime, timedelta
import pendulum

from airflow import DAG
try:
    from airflow.operators.empty import EmptyOperator
except ImportError:
    from airflow.operators.dummy import DummyOperator as EmptyOperator
from airflow.utils.dates import days_ago
from airflow.providers.google.cloud.operators.bigquery import BigQueryExecuteQueryOperator

def jst_daily_schedule(hour, minute):
    time = datetime(2000, 1, 1, hour=hour, minute=minute, tzinfo=pendulum.timezone("Asia/Tokyo"))
    utc = pendulum.timezone("UTC")
    utc_time = utc.convert(time)
    return utc_time.strftime("%M %H * * *")

def jst_now():
    return pendulum.now("Asia/Tokyo")

default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "start_date": days_ago(30),
    "retries": 0,
    "retry_delay": timedelta(minutes=1),
    "aws_conn_id": "easi_mon_aws",
}

with DAG(
        "export-bq-and-import-bq",
        default_args=default_args,
        description="insert bq query result to another bq table",
        dagrun_timeout=timedelta(minutes=90),
        schedule_interval=jst_daily_schedule(hour=6, minute=50),
        catchup=False,
        max_active_runs=1,
) as dag:
    begin = EmptyOperator(task_id="start")
    end = EmptyOperator(task_id="end")

    export_bq = BigQueryExecuteQueryOperator(
        task_id="export_bq_data",
        sql="""
        EXPORT DATA OPTIONS (
            uri="gs://bigquery-export-7825b675403f1831/export/{{ execution_date.subtract(days=1) | ds }}/*.gz",
            format=CSV,
            compression=GZIP,
            overwrite=true,
            header=true,
            field_delimiter=","
        ) AS
        SELECT * FROM `gcp-terraform-github.dataset.users` WHERE DATE(created_at) = "{{ execution_date.subtract(days=1) | ds }}"
        """,
        location="us-west1",
        use_legacy_sql=False)

    begin >> export_bq >> end
