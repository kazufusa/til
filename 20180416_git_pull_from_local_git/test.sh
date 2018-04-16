#!/bin/sh

set -Ceux

rm -rf from to

mkdir from
mkdir to

cd from

git init
git config --local user.name test
git config --local user.email test@test.com
echo "Hello world" > test.txt
git add test.txt
git commit -m "initial commit"

cd ..

cd to
git init
git remote add origin ../from
git pull origin master
git ls-files
git show
cd ..
