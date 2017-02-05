#!/bin/sh
mpirun -np 4 -host master,node1,node2,node3 ./mpi-ping -B -r 10 1m
