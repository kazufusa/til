# Docker and OpenMPI

```sh
$ docker-compose build
$ docker-compose up -d
$ docker-compose exec --user user master bash
[user@***** ~]$ sh -x run.sh
+ /usr/lib64/openmpi/bin/mpirun -host master,node1,node2,node3 ./mpi-ping -B -r 10 1m
+ Warning: Permanently added 'node2,172.21.0.3' (RSA) to the list of known hosts.
+ Warning: Permanently added 'node1,172.21.0.2' (RSA) to the list of known hosts.
+ Warning: Permanently added 'node3,172.21.0.4' (RSA) to the list of known hosts.
+ mpi-ping: ping-pong (using blocking send/recv)
+ nprocs=4, reps=10, min bytes=1048576, max bytes=1048576 inc bytes=0
+ 2 pings 3
+ 0 pings 1
+   0 pinged   1:  1048576 bytes 225002.55 uSec     4.66 MB/s
+   2 pinged   3:  1048576 bytes 212475.85 uSec     4.94 MB/s
[user@***** ~]$ exit
$ docker-compose stop
$ docker-compose rm -f
```
