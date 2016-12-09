FROM mdillon/postgis:latest

ENV POSTGRES_USER postgres
ENV POSTGRES_PASSWORD postgres

RUN mv /docker-entrypoint-initdb.d/postgis.sh /docker-entrypoint-initdb.d/00_postgis.sh
COPY ./import.sh /docker-entrypoint-initdb.d/01_postgis_import.sh
EXPOSE 5432
