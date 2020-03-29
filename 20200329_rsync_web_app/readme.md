# rsync 

```bash
$ BASE=localhost:$PWD/ sh ./test.sh
# from dir
.
|-- [ 128]  from_dir
|   |-- [ 224]  api
|   |   |-- [  64]  .git
|   |   |-- [  96]  config
|   |   |   `-- [   3]  database.yml
|   |   |-- [   4]  .gitignore
|   |   |-- [   4]  app.app
|   |   `-- [   4]  tmp
|   `-- [ 192]  client
|       |-- [  64]  .git
|       |-- [  96]  build
|       |   `-- [   9]  front.html
|       |-- [   8]  .gitignore
|       `-- [   4]  src.html
|-- [  11]  readme.md
`-- [1.1K]  test.sh

7 directories, 9 files
# execute rsync in from dir
<<CHANGED>cd++++++++++ ./
<<CHANGED>cd++++++++++ api/
<<CHANGED><f++++++++++ api/.gitignore
<<CHANGED><f++++++++++ api/app.app
<<CHANGED>cd++++++++++ api/.git/
<<CHANGED>cd++++++++++ api/config/
<<CHANGED>cd++++++++++ client/
<<CHANGED><f++++++++++ client/.gitignore
<<CHANGED><f++++++++++ client/src.html
<<CHANGED>cd++++++++++ client/.git/
<<CHANGED>cd++++++++++ client/build/
<<CHANGED><f++++++++++ client/build/front.html
# from dir and dest dir
.
|-- [ 128]  from_dir
|   |-- [ 224]  api
|   |   |-- [  64]  .git
|   |   |-- [  96]  config
|   |   |   `-- [   3]  database.yml
|   |   |-- [   4]  .gitignore
|   |   |-- [   4]  app.app
|   |   `-- [   4]  tmp
|   `-- [ 192]  client
|       |-- [  64]  .git
|       |-- [  96]  build
|       |   `-- [   9]  front.html
|       |-- [   8]  .gitignore
|       `-- [   4]  src.html
|-- [ 128]  to_dir
|   |-- [ 192]  api
|   |   |-- [  64]  .git
|   |   |-- [  64]  config
|   |   |-- [   4]  .gitignore
|   |   `-- [   4]  app.app
|   `-- [ 192]  client
|       |-- [  64]  .git
|       |-- [  96]  build
|       |   `-- [   9]  front.html
|       |-- [   8]  .gitignore
|       `-- [   4]  src.html
|-- [ 939]  readme.md
`-- [1.1K]  test.sh

14 directories, 14 files
# diff of from dir and dest dir
diff -ry from_dir/api/.gitignore to_dir/api/.gitignore
tmp								tmp
diff -ry from_dir/api/app.app to_dir/api/app.app
APP								APP
Only in from_dir/api/config: database.yml
Only in from_dir/api: tmp
diff -ry from_dir/client/.gitignore to_dir/client/.gitignore
build/*								build/*
diff -ry from_dir/client/build/front.html to_dir/client/build/front.html
FRONTEND							FRONTEND
diff -ry from_dir/client/src.html to_dir/client/src.html
SRC								SRC
# edit from_dir/client/src.html and execute rsync in from dir
<<CHANGED><f.st....... client/src.html
```
