# docker and postgis

## setup

1. download and extract N03-160101_GML in ./postgis/
2. exec below code

```
$ docker-compose build && docker-compose up
```

## test

### connection test

```
$ PGPASSWORD=postgres psql -h localhost -U postgres -c "SELECT version();"
                                         version
------------------------------------------------------------------------------------------
 PostgreSQL 9.6.1 on x86_64-pc-linux-gnu, compiled by gcc (Debian 4.9.2-10) 4.9.2, 64-bit
(1 row)

$ PGPASSWORD=postgres psql -h localhost -U postgres -c "\dx;"
                                            List of installed extensions
          Name          | Version |   Schema   |                             Description
------------------------+---------+------------+---------------------------------------------------------------------
 fuzzystrmatch          | 1.1     | public     | determine similarities and distance between strings
 plpgsql                | 1.0     | pg_catalog | PL/pgSQL procedural language
 postgis                | 2.3.0   | public     | PostGIS geometry, geography, and raster spatial types and functions
 postgis_tiger_geocoder | 2.3.0   | tiger      | PostGIS tiger geocoder and reverse geocoder
 postgis_topology       | 2.3.0   | topology   | PostGIS topology spatial types and functions
(5 rows)
```

### Reverse geocoding

```
$ PGPASSWORD=postgres psql -h localhost -U postgres -c "SELECT gid, n03_001, n03_002, n03_003, n03_004, n03_007 FROM japan WHERE ST_Contains(geom, 'SRID=4612;POINT(140.080410 36.081980)');"
 n03_001 | n03_002 | n03_003 | n03_004  | n03_007
---------+---------+---------+----------+---------
 茨城県  |         |         | つくば市 | 08220
(1 row)
```
