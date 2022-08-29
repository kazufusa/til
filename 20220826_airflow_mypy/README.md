# mypyとpysenについて

pysenはmypyの"ignore_missing_imports"を常に有効にしている.
そのため, importできないpackageがある場合は無視, それに付随するエラー(importできないpackageを使った際の型エラー当)も無視する.
この辺理解していないと使いにくい.

## 検討

dagsディレクトリ下に`.mypy.ini`を配置し, 以下を設定する.

```ini
[mypy]
ignore_missing_imports = false  # missing importsを無視しない
namespace_packages = true       # namespace packagesを有効化
explicit_package_bases = true   # カレントディレクトリをtoplevel packageとする
# こちらと等価: mypy . --namespace-package --explicit-package-bases
```

dagsディレクトリ下でmypyを実行する.

```sh
$ (cd dags && mypy .)
test.py:5: error: Incompatible return value type (got "Person", expected "Dog")
Found 1 error in 1 file (checked 2 source files)

```

期待通りの動き. pysenで`explicit_package_bases = true`を設定できるといいのだが...


## 以下試行錯誤


```sh
❯ pysen run lint
Running commands concurrently...
... concurrent execution done
Running: black
Checking 2 files
All done! ✨ 🍰 ✨
2 files would be left unchanged.
Running: flake8
Checking 2 files
Running: isort
Checking 2 files
Running: mypy
[1/1] Checking 1 entries
Success: no issues found in 2 source files

 ** execution summary **
isort .......... OK (1.03 sec)
black .......... OK (1.58 sec)
flake8 .......... OK (1.71 sec)
mypy .......... OK (1.10 sec)


❯ mypy .
dags/test.py:1: error: Cannot find implementation or library stub for module named "common.utils"
dags/test.py:1: note: See https://mypy.readthedocs.io/en/stable/running_mypy.html#missing-imports
Found 1 error in 1 file (checked 2 source files)

❯ touch dags/common/__init__.py

❯ mypy .
dags/test.py:5: error: Incompatible return value type (got "Person", expected "Dog")
Found 1 error in 1 file (checked 3 source files)

❯ pysen run lint
Running commands concurrently...
... concurrent execution done
Running: black
Checking 2 files
All done! ✨ 🍰 ✨
2 files would be left unchanged.
Running: flake8
Checking 2 files
Running: isort
Checking 2 files
Running: mypy
[1/1] Checking 1 entries
/home/kazufusa/src/github.com/kazufusa/til/20220826_airflow_mypy/dags/test.py:5: error:
Incompatible return value type (got "Person", expected "Dog")  [return-value]
        return Person(name)
               ^
Found 1 error in 1 file (checked 3 source files)

 ** execution summary **
isort .......... OK (0.89 sec)
black .......... OK (1.48 sec)
flake8 .......... OK (1.73 sec)
mypy .......... Failed (5.30 sec)

lint finished with error(s)
Errored:
 - mypy


❯ (cd dags && mypy . --explicit-package-bases --namespace-package)
test.py:5: error: Incompatible return value type (got "Person", expected "Dog")
Found 1 error in 1 file (checked 2 source files)

```

