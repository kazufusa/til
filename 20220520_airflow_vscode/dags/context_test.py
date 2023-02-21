# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Example DAG demonstrating the usage of context."""

import datetime
import pendulum

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator
from airflow.operators.python_operator import PythonOperator


def jst_now():
    return pendulum.now("Asia/Tokyo")


def a(a: int) -> int:
    return ""


a("a")


with DAG(
    dag_id="context_test",
    schedule_interval="* * * * *",
    start_date=pendulum.datetime(2021, 1, 1, tz="UTC"),
    catchup=False,
    dagrun_timeout=datetime.timedelta(minutes=60),
    tags=["mine"],
    params={"example_key": "example_value"},
) as dag:
    run_this_last = EmptyOperator(
        task_id="run_this_last",
    )

    # [START howto_operator_bash]
    run_this = BashOperator(
        task_id="run_after_loop",
        bash_command="echo 1",
    )
    # [END howto_operator_bash]

    def define_date(**context):
        execution_date = context.get("execution_date")
        jst_date = execution_date.in_tz("Asia/Tokyo")
        context["ti"].xcom_push(key="today_date", value=str(jst_date.add(days=1)))
        print("execution_date:", jst_date)
        print("start_date:    ", jst_now())
        print("context[ti]:   ", context["ti"].xcom_pull(key="today_date"))

    date_def = PythonOperator(
        task_id="date_def",
        python_callable=define_date,
        provide_context=True,
    )

    run_this >> date_def >> run_this_last

if __name__ == "__main__":
    dag.cli()
