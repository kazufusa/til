#!/bin/sh

set -Ceu

export PGCONTAINER=postgis_calcgreen

export PGHOST=localhost
export PGDATABASE=postgres
export PGUSER=postgres
export PGPASSWORD=postgres

if ! psql -c "\dt;" | grep -q japan_ks; then
  TASK=LOADING_JAPAN_KS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` START_$TASK

  docker exec -i $PGCONTAINER bash -c \
    'shp2pgsql -s 4326 -D -i -I -W cp932 shapefiles/*.shp tmp' | psql >/dev/null

  cat << EOS | psql
  delete from tmp where n03_007 is NULL;

  alter table tmp rename n03_001 to prefecture_name;
  alter table tmp rename n03_007 to city_code;

  alter table tmp add prefecture_code varchar(2);
  update tmp set prefecture_code = substring(city_code,1,2);

  alter table tmp add city_name varchar(60);
  update tmp set city_name = coalesce(n03_003, '') || coalesce(n03_004, '');

  create table japan_ks as
  select
    cast(prefecture_code as integer) as prefecture_code
    , prefecture_name
    , cast(city_code as integer) as city_code
    , city_name
    , sum(ST_Area(geography(geom))) as area
    , ST_Union(geom) as geom
  from tmp
  group by
    prefecture_code
    , prefecture_name
    , city_code
    , city_name
  ;
  drop table tmp;
  create index on japan_ks using gist (geom);
  analyze japan_ks;
EOS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` FINISH_$TASK
fi

if ! psql -c "\dt;" | grep -q "alos_rast"; then
  TASK=LOADING_ALOS_RASTERS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` START_$TASK

  ALOS_GEOTIF=/usr/src/LC/ver1609_LC_GeoTiff_500m.tif
  ALOS_GEOTIF=/usr/src/LC/LC*.tif
  docker exec -i $PGCONTAINER bash <<EOF | psql > /dev/null
  raster2pgsql -I -C -s 4326 -N 0 -t 100x100 \
    $ALOS_GEOTIF \
    alos_rast
EOF

  cat <<EOS | psql
  create table alos_code_name (
    code integer primary key,
    name varchar(40)
  );
  insert into alos_code_name (code, name) values
    (0,   '未分類'),
    (1,   '水域'),
    (2,   '都市'),
    (3,   '水田'),
    (4,   '畑地'),
    (5,   '草地'),
    (6,   '落葉広葉樹'),
    (7,   '落葉針葉樹'),
    (8,   '常緑広葉樹'),
    (9,   '常緑針葉樹'),
    (10,  '裸地'),
    (11,  '雪氷'),
    (253, 'その他'),
    (255, 'データなし')
  ;
EOS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` FINISH_$TASK
fi

# # 何故か失敗
# cat <<EOS | psql
# select
#   alos_rast.rid as rid
#   , (ST_Intersection(japan_ks.geom, alos_rast.rast)).val
#   , (ST_Intersection(japan_ks.geom, alos_rast.rast)).geom
# from
#   (select
#       *
#     from
#       japan_ks
#     where city_name = '東久留米市'
#   ) as japan_ks
#   , (select * from alos_rast)
# where
#   ST_Intersects(japan_ks.geom, alos_rast.rast)
# ;
# EOS

if ! psql -c "\dt;" | grep -q alos_geo; then
  TASK=CONVERTING_ALOS_RASTERS_TO_GEOMETRIES
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` START_$TASK
  cat <<EOS | psql
  create table alos_geo as
  select
    alos_geo.rid as rid
    , (alos_geo.geomval).val as code
    , (alos_geo.geomval).geom as geom
  from
    (select
      alos_rast.rid as rid
      , ST_DumpAsPolygons(alos_rast.rast) as geomval
    from
      (select ST_Union(geom) as geom from japan_ks) as whole_japan
      , alos_rast
    where
      ST_Intersects(whole_japan.geom, alos_rast.rast)
    ) as alos_geo
  ;
  create index on alos_geo using gist (geom);
  analyze alos_geo;
EOS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` FINISH_$TASK
fi

if ! psql -c "\dt;" | grep -q japan_alos; then
  TASK=CALC_INTERSECTIONS_OF_JAPAN_KS_AND_ALOS_GEOM
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` START_$TASK
  cat <<EOS | psql
  create table japan_alos as
  select
    japan_ks.city_code as city_code
    , japan_ks.city_name as city_name
    , alos_geo.code as alos_code
    , ST_Intersection(japan_ks.geom, alos_geo.geom) as geom
  from
    japan_ks
    , alos_geo
  where
    ST_Intersects(japan_ks.geom, alos_geo.geom)
  ;
EOS
  echo "LOG:" `date '+%Y-%m-%dT%H:%M:%S'` FINISH_$TASK
fi

# cat <<EOS | psql
# select
#   ratios.city_code as city_code
#   , min(ratios.city_name) as city_name
#   , sum(ratios.ratio) as green_ratio
# from
#   (select
#     japan_alos.city_code
#     , min(japan_alos.city_name) as city_name
#     , min(alos_code_name.name) as alos_name
#     , min(alos_code_name.code) as alos_code
#     , sum(ST_Area(geography(japan_alos.geom))) / min(japan_ks.area) as ratio
#   from
#     japan_alos
#     left join alos_code_name on (japan_alos.alos_code = alos_code_name.code)
#     left join japan_ks on (japan_alos.city_code = japan_ks.city_code)
#   where
#     alos_code between 5 and 9
#   group by
#     japan_alos.city_code
#     , japan_alos.alos_code
#   order by
#     japan_alos.city_code
#   ) as ratios
# group by
#   ratios.city_code
# order by
#   green_ratio
# ;
# EOS
