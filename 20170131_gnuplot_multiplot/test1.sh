#!/bin/sh

cat <<EOS | gnuplot
set term png enhanced size 800, 400
set output "test1.png

# set size ratio -1

set multiplot

# Set ranges and *in this case* isosamples to make the graph look better
set xrange [-1:1] ; set yrange [-2:2] ; set isosamples 100

# Options for the first graph: set top and bottom margins and unset colorbox
set lmargin screen 0.1 ; set rmargin screen 0.25
set tmargin screen 0.9 ; set bmargin screen 0.1 ; unset colorbox

# Plot it
plot "++" u (\$1):(\$2):(sin(\$1*\$2)) with image t '(a) 1'

# Options for second graph
set lmargin screen 0.3 ; set rmargin screen 0.45

# Plot it
plot "++" u (\$1):(\$2):(cos(\$1*\$2)) with image t '(b) 2'

# Options for third graph
set lmargin screen 0.5 ; set rmargin screen 0.65

# Plot it
plot "++" u (\$1):(\$2):(cos(\$1*\$2)) with image t '(c) 3'

# Options for fourth graph
set lmargin screen 0.7 ; set rmargin screen 0.85

# Set colorbox with customize options
set colorbox user origin 0.88,0.1 size 0.03,0.8

# Plot it
plot "++" u (\$1):(\$2):(cos(\$1*\$2)) with image t '(d) 4'

#
# set multiplot layout 1,3
#
# set pm3d
# set pm3d map corners2color c1
# set ticslevel 0
# set cbrange[-1:1]
# set palette defined (-2 "blue", 0 "white", 2 "red")
# # set colorbox user origin screen 0, screen 0.05 size screen 0.055, screen 0.8
# unset colorbox
#
# splot '-' with pm3d t ''
# 1 1 -1
# 1 2 0
# 1 3 1
#
# 2 1 1
# 2 2 1
# 2 3 0
#
# 3 1 -2
# 3 2 -1
# 3 3 -2
# e
#
# unset colorbox
# splot '-' with pm3d t ''
# 1 1 -1
# 1 2 0
# 1 3 1
#
# 2 1 1
# 2 2 1
# 2 3 0
#
# 3 1 -2
# 3 2 -1
# 3 3 -2
# e
#
# splot '-' with pm3d t ''
# 1 1 -1
# 1 2 0
# 1 3 1
#
# 2 1 1
# 2 2 1
# 2 3 0
#
# 3 1 -2
# 3 2 -1
# 3 3 -2
# e
EOS
