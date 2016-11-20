#!/bin/sh
/usr/lib64/openmpi/bin/mpirun -host master,node1,node2,node3 ./mpi-ping -B -r 10 1m
