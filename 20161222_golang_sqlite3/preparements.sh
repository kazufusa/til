#!/bin/sh

set -eux

CSV=10010301007_00.csv
ZIP=$CSV.zip
URL=http://emdb.jaea.go.jp/emdb/assets/site_data/ja/csv_utf8/10010301007/$ZIP

if [ ! -f $CSV ]; then
  wget $URL
  unzip $ZIP
fi

tail -n +2 $CSV | cut -d, -f1,2,3,4,7,8,9,10 | sed -e 's/_//g' > t1.csv
rm -rf t2.csv
for i in `seq 1 10`; do
  cat t1.csv >> t2.csv
done

cat << EOS | sqlite3 foo.db
.separator ,
.headers on
create table bar (
  id       integer,
  date     date,
  pref     text,
  city     text,
  lat      real,
  lon      real,
  distance real,
  doserate real
);
.import t2.csv bar
.schema bar
select count(*) from bar;
select * from bar limit 5;
EOS
