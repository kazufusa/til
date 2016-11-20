#!/bin/sh
set -eux

gcc -fopenmp -O3 -o prime prime.c
./prime
OMP_NUM_THREADS=1 ./prime
OMP_NUM_THREADS=2 ./prime
OMP_NUM_THREADS=3 ./prime
OMP_NUM_THREADS=4 ./prime
OMP_NUM_THREADS=5 ./prime
