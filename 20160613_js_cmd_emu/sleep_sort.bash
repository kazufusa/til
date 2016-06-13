#!/bin/bash
function f() {
  while [ -n "$1" ]
  do
    (sleep "$1" && echo "$1") &
    shift
  done
  wait
}
f 5 4 3 2 1
