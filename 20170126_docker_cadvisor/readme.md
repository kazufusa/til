## Preparements

Run heavytask.sh and cadvisor.sh.
These command start heavytask container and cAdvisor container.

## get memory usage via cAdvisor api

```
$ while sleep 10; do {echo $(curl -s http://0.0.0.0:8080/api/v2.0/stats/heavytask\?type=docker | jq ".[][0].memory.usage") / 1024 / 1024 | bc } done 
763
0
763
763
...
```
