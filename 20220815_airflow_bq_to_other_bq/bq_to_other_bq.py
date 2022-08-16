from datetime import datetime, timedelta
import pendulum

from airflow import DAG
from airflow.models import Variable
try:
    from airflow.operators.empty import EmptyOperator
except ImportError:
    from airflow.operators.dummy import DummyOperator as EmptyOperator
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from airflow.providers.google.cloud.operators.bigquery import BigQueryExecuteQueryOperator, BigQueryCreateEmptyTableOperator
from airflow.providers.google.cloud.operators.gcs import GCSDeleteObjectsOperator, GCSListObjectsOperator
from airflow.providers.google.cloud.transfers.gcs_to_bigquery import GCSToBigQueryOperator

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
        sql="export_bq.sql",
        location="us-west1",
        use_legacy_sql=False)

    create_replica_table_if_not_exists = BigQueryCreateEmptyTableOperator(
        task_id="create_replica_table_if_not_exists",
        project_id="gcp-terraform-github",
        dataset_id="dataset2",
        table_id="users",
        schema_fields=[
            {"name": "ID"        , "type": "INT64"},
            {"name": "Name"      , "type": "STRING"},
            {"name": "favorite"  , "type": "STRING"},
            {"name": "created_at", "type": "DATETIME"},
        ],
        time_partitioning = {
            "type": "DAY",
            "field": "created_at",
            # "require_partition_filter": True,
        },
        exists_ok=True,
    )

    delete_existing_data = BigQueryExecuteQueryOperator(
        task_id="delete_existing_data",
        sql="delete_exisiting_data.sql",
        location="asia-northeast1",
        use_legacy_sql=False)

    # gcs_files = GCSListObjectsOperator(
    #     task_id="gcs_files",
    #     bucket="bigquery-export-7825b675403f1831",
    #     prefix="export/{{ execution_date.subtract(days=1) | ds }}",
    # )
    #
    # def print_gcs_files(ti):
    #     file_names = ti.xcom_pull(task_ids="gcs_files", dag_id="export-bq-and-import-bq", key="return_value")
    #     file_names = [x for x in file_names if "transaction" in x]
    #     logging.info("GCS Files: \n" + "\n".join(file_names))
    #     val = Variable.set("files", file_names, serialize_json=True)
    #
    # confirm_gcs_files = PythonOperator(
    #     task_id="confirm_gcs_files",
    #     provide_context=True,
    #     python_callable=print_gcs_files,
    # )

    copy_to_replica_table = GCSToBigQueryOperator(
        task_id="copy_to_replica_table",
        bucket="bigquery-export-7825b675403f1831",
        source_objects=["export/{{ execution_date.subtract(days=1) | ds }}/*"],
        destination_project_dataset_table="gcp-terraform-github:dataset2.users",
        skip_leading_rows=1,
        source_format="CSV",
        compression=True,
        schema_fields=[
            {"name": "ID"        , "type": "INT64"},
            {"name": "Name"      , "type": "STRING"},
            {"name": "favorite"  , "type": "STRING"},
            {"name": "created_at", "type": "DATETIME"},
        ],
        write_disposition="WRITE_APPEND",
    )

    remove_exported_csv = GCSDeleteObjectsOperator(
        task_id="remove_exported_csv",
        bucket_name="bigquery-export-7825b675403f1831",
        prefix="export/{{ execution_date.subtract(days=1) | ds }}",
    )

    (
        begin
        # >> gcs_filej
        # >> confirm_gcs_files
        # >> end
        >> export_bq
        >> create_replica_table_if_not_exists
        >> delete_existing_data
        >> copy_to_replica_table
        >> remove_exported_csv
        >> end
    )
