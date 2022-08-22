from airflow.decorators import dag, task
from datetime import timedelta
import pendulum
try:
    from airflow.operators.empty import EmptyOperator
except ImportError:
    from airflow.operators.dummy import DummyOperator as EmptyOperator
from airflow.operators.bash import BashOperator
from airflow.models.baseoperator import chain

@dag(schedule_interval="@once", start_date=pendulum.datetime(2021, 1, 1, tz="UTC"))
def parallel_test_wf():
    begin = EmptyOperator(task_id="start")
    t1 = BashOperator(
        task_id='sleep1_and_exit2',
        bash_command='sleep 20; exit 2',
    )

    t2 = BashOperator(
        task_id='sleep2',
        bash_command='sleep 10',
    )

    end = EmptyOperator(task_id="end")
    begin >> [t1, t2] >> end

dag = parallel_test_wf()
