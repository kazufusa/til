#!/bin/sh
set -x
rm -rf from_dir to_dir
mkdir -p from_dir/api/{.git,config} from_dir/client/{.git,build}
echo APP > from_dir/api/app.app
echo TMP > from_dir/api/tmp
echo DB > from_dir/api/config/database.yml
echo "tmp" > from_dir/api/.gitignore

echo "build/*" > from_dir/client/.gitignore
echo FRONTEND > from_dir/client/build/front.html
echo SRC > from_dir/client/src.html

echo "# from dir"
tree -h -a --charset=C --dirsfirst

echo "# execute rsync in from dir"
(
cd from_dir &&
rsync --delay-updates -F --compress --archive -C --include='build/*' --include=.git --exclude=database.yml --filter=':- .gitignore' --out-format='<<CHANGED>%i %n%L'  . ${BASE}to_dir/
)
echo "# from dir and dest dir"
tree -h -a --charset=C --dirsfirst
echo "# diff of from dir and dest dir"
diff -ry from_dir to_dir

echo "# edit from_dir/client/src.html and execute rsync in from dir"
echo SRC2 > from_dir/client/src.html
(
cd from_dir &&
rsync --delay-updates -F --compress --archive -C --include='build/*' --include=.git --exclude=database.yml --filter=':- .gitignore' --out-format='<<CHANGED>%i %n%L'  . ${BASE}to_dir/
)
