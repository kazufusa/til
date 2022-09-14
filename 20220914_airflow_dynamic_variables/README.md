# Airflow: Configure Jinja template parameters dynamically


```python
import pendulum
from airflow.decorators import dag
from airflow.operators.bash_operator import BashOperator
from airflow.providers.google.cloud.operators.bigquery import (
    BigQueryExecuteQueryOperator,
)
from airflow.utils.task_group import TaskGroup

try:
    from airflow.operators.empty import EmptyOperator
except ImportError:
    from airflow.operators.dummy import DummyOperator as EmptyOperator


def mytask(i: int) -> TaskGroup:
    with TaskGroup(group_id=f"mytask-{i}") as tg:
        BashOperator(
            task_id="bash",
            bash_command="echo I am {{ params.output }}",
            params={"output": i},
        ) >> BigQueryExecuteQueryOperator(
            task_id="bq",
            sql="SELECT DATE '2022-01-0{{ params.date }}'",
            location="us-central1",
            use_legacy_sql=False,
            params={"date": i % 29 + 1},
        )

    return tg


@dag(
    start_date=pendulum.datetime(2021, 1, 1, tz="UTC"),
    schedule_interval="@daily",
    catchup=False,
)
def mywf() -> None:
    start = EmptyOperator(task_id="start")
    end = EmptyOperator(task_id="end")

    bos = [mytask(i) for i in range(5)]

    start >> bos >> end


wf = mywf()
```
