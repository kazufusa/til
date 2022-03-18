# 楕円曲線暗号のPythonによる実装その1（有限体とECDH鍵共有）

https://zenn.dev/herumi/articles/sd202203-ecc-1

## how to use

```
$ docker compose up
...
20220318_python_ecdh-notebook-1  | [I 2022-03-18 09:26:25.777 ServerApp] http://1bd75ca63b89:8888/lab?token=6b35bd76ff41630c94974ff368fa68f80e9f2438d8809d0f
20220318_python_ecdh-notebook-1  | [I 2022-03-18 09:26:25.777 ServerApp]  or http://127.0.0.1:8888/lab?token=6b35bd76ff41630c94974ff368fa68f80e9f2438d8809d0f
20220318_python_ecdh-notebook-1  | [I 2022-03-18 09:26:25.777 ServerApp] Use Control-C to stop this server and shut down all kernels (twice to skip confirmation).
20220318_python_ecdh-notebook-1  | [C 2022-03-18 09:26:25.780 ServerApp]
20220318_python_ecdh-notebook-1  |
20220318_python_ecdh-notebook-1  |     To access the server, open this file in a browser:
20220318_python_ecdh-notebook-1  |         file:///home/jovyan/.local/share/jupyter/runtime/jpserver-7-open.html
20220318_python_ecdh-notebook-1  |     Or copy and paste one of these URLs:
20220318_python_ecdh-notebook-1  |         http://1bd75ca63b89:8888/lab?token=6b35bd76ff41630c94974ff368fa68f80e9f2438d8809d0f
20220318_python_ecdh-notebook-1  |      or http://127.0.0.1:8888/lab?token=6b35bd76ff41630c94974ff368fa68f80e9f2438d8809d0f
...
```
