FROM mdillon/postgis:latest

RUN /bin/echo -e '#!/bin/sh\n\
export PGUSER="$POSTGRES_USER"\n\
echo "Loading PostGIS extensions into $DB"\n\
"${psql[@]}" --dbname="$POSTGRES_DB" <<-EOSQL\n\
  create extension if not exists postgis;\n\
EOSQL\n'\
> /docker-entrypoint-initdb.d/postgis.sh
RUN cat /docker-entrypoint-initdb.d/postgis.sh
EXPOSE 5432
