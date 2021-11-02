# Rename master branch to main

```sh
$ git branch -m master main
$ git remote set-head origin -a
$ git branch --set-upstream-to=origin/main main
```

- `git branch -m`: move/rename a branch and its reflog
- `git remote set-head`: change the default branch(refs/remotes/<name>/HEAD) for the named remote.
    - `-a` or `--auto`: sync branch name with local HEAD
- `git branch --set-upstream-to=origin/main main`: set origin/main as the upstream branch of local main.
