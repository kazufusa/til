#!/bin/sh
set -eux
gcc gdaltest.c $(pkg-config gdal --libs --cflags)
