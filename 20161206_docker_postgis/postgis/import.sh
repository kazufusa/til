#/bin/sh
set -eu

cd /usr/app/shape
export PGUSER="$POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"

shp2pgsql -s 4612 -D -i -I -W cp932 *.shp japan > japan.sql
"${psql[@]}" -h localhost -U postgres -f japan.sql
