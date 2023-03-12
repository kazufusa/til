# airflow and task brancing

[example_branch_operator_decorator](https://airflow.apache.org/docs/apache-airflow/stable/_modules/airflow/example_dags/example_branch_operator_decorator.html)

```py
import pendulum
from airflow import DAG
from airflow.decorators import task
from airflow.models import Variable
from airflow.operators.empty import EmptyOperator
from airflow.utils.edgemodifier import Label
from airflow.utils.trigger_rule import TriggerRule

with DAG(
    dag_id="test_example_branch_python_operator_decorator",
    start_date=pendulum.datetime(2021, 1, 1, tz="UTC"),
    catchup=False,
    schedule="@daily",
    tags=["example", "example2"],
) as dag:
    start = EmptyOperator(task_id="start")
    end = EmptyOperator(
        task_id="end", trigger_rule=TriggerRule.NONE_FAILED_MIN_ONE_SUCCESS
    )

    @task.branch(task_id="branching")
    def random_choice() -> str:
        env = Variable.get("env")
        return "production_task" if env == "production" else "end"

    random_choice_instance = random_choice()

    start >> random_choice_instance

    (
        random_choice_instance
        >> Label("production_task")
        >> EmptyOperator(task_id="production_task")
        >> EmptyOperator(task_id="follow_production_task")
        >> end
    )

    random_choice_instance >> Label("not production") >> end
```

## test

https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/index.html
