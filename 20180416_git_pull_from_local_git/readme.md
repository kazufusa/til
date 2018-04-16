# git pull from another local git repository

```
# sh test.sh
+ rm -rf from to
+ mkdir from
+ mkdir to
+ cd from
+ git init
Initialized empty Git repository in /Users/kazufusa/Documents/til/20180416_git_pull_from_local_git/from/.git/
+ git config --local user.name test
+ git config --local user.email test@test.com
+ echo 'Hello world'
+ git add test.txt
+ git commit -m 'initial commit'
[master (root-commit) a285287] initial commit
 1 file changed, 1 insertion(+)
 create mode 100644 test.txt
+ cd ..
+ cd to
+ git init
Initialized empty Git repository in /Users/kazufusa/Documents/til/20180416_git_pull_from_local_git/to/.git/
+ git remote add origin ../from
+ git pull origin master
From ../from
 * branch            master     -> FETCH_HEAD
 * [new branch]      master     -> origin/master
+ git ls-files
test.txt
+ git show
commit a285287ae257c5f4b84809086fb9b15803476475
Author: test <test@test.com>
Date:   Mon Apr 16 22:48:44 2018 +0900

    initial commit

diff --git a/test.txt b/test.txt
new file mode 100644
index 0000000..802992c
--- /dev/null
+++ b/test.txt
@@ -0,0 +1 @@
+Hello world
+ cd ..
```
