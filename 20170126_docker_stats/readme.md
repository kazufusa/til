## Preparements

Run heavytask.sh. This command starts heavytask.

## get stats

```
$ while sleep 60; do {docker stats heavytask --no-stream --format "table {w{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | tail -n 1} done
heavytask           0.00%               792.5 MiB / 1.952 GiB
heavytask           0.00%               28.07 MiB / 1.952 GiB
heavytask           0.00%               28.07 MiB / 1.952 GiB
heavytask           0.00%               28.07 MiB / 1.952 GiB
heavytask           0.00%               28.07 MiB / 1.952 GiB
heavytask           0.00%               28.06 MiB / 1.952 GiB
heavytask           0.00%               28.06 MiB / 1.952 GiB
...
```
