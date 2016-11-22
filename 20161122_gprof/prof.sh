#!/bin/sh
set -eux
g++ -pg -fno-inline test.cpp
time ./a.out
ls -lh
gprof a.out gmon.out
