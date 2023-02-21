FROM apache/airflow:2.2.3-python3.8

ENV AIRFLOW__CORE__LOAD_EXAMPLES=False
ENV AIRFLOW__CORE__UNIT_TEST_MODE=True
ENV AIRFLOW__CORE__EXECUTOR=DebugExecutor
ENV PYTHONPATH=/opt/airflow/dags

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      git \
  && apt-get -y clean \
  && rm -rf /var/lib/apt/lists/*

USER airflow
COPY requirements.txt /opt/airflow/requirements.txt
RUN pip install -U "pysen[lint]" pytest pytest-mock pytest-freezegun \
  && pip install -r requirements.txt

ENTRYPOINT []
CMD ["/bin/bash", "-c", "python -m pytest ${TARGET}"]
