#!/bin/sh

cat <<EOS | gnuplot
set term png enhanced size 800, 400
set output "test2.png

# set size ratio -1

set multiplot

set pm3d
set pm3d map corners2color c1
set ticslevel 0
set cbrange[-1:1]
set palette defined (-2 "blue", 0 "white", 2 "red")
unset colorbox

set lmargin screen 0.1 ; set rmargin screen 0.25
set tmargin screen 0.9 ; set bmargin screen 0.1 ; unset colorbox

set title '(a) c1' offset 0,-0.4
splot '-' with pm3d t '(a) c1'
1 1 -1
1 2 0
1 3 1

2 1 1
2 2 1
2 3 0

3 1 -2
3 2 -1
3 3 -2
e

set pm3d map corners2color c2
set lmargin screen 0.3 ; set rmargin screen 0.45
set title '(b) c2' offset 0,-0.4
splot '-' with pm3d t ''
1 1 -1
1 2 0
1 3 1

2 1 1
2 2 1
2 3 0

3 1 -2
3 2 -1
3 3 -2
e

set pm3d map corners2color c3
set lmargin screen 0.5 ; set rmargin screen 0.65
set title '(c) c3' offset 0,-0.4
splot '-' with pm3d t ''
1 1 -1
1 2 0
1 3 1

2 1 1
2 2 1
2 3 0

3 1 -2
3 2 -1
3 3 -2
e

set pm3d map corners2color c4
set lmargin screen 0.7 ; set rmargin screen 0.85
# set colorbox user origin screen 0, screen 0.05 size screen 0.055, screen 0.8
set colorbox user origin 0.88,0.1 size 0.03,0.8

set title '(d) c4' offset 0,-0.4

splot '-' with pm3d t ''
1 1 -1
1 2 0
1 3 1

2 1 1
2 2 1
2 3 0

3 1 -2
3 2 -1
3 3 -2
e
EOS
