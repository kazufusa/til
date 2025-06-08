CREATE DATABASE app_datamart;
REVOKE CONNECT ON DATABASE app_datamart FROM PUBLIC;

CREATE USER "deploy_web_app@xxxxxx.iam" WITH LOGIN PASSWORD 'password';
CREATE USER "app_runner@xxxxxx.iam" WITH LOGIN PASSWORD 'password';
CREATE USER "user" WITH LOGIN PASSWORD 'password';
CREATE USER "developer" WITH LOGIN PASSWORD 'password';
