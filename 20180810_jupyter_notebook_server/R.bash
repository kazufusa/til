#!/bin/bash

export DEBIAN_FRONTEND=noninteractive

apt-get update && apt-get install -y \
    libgit2-dev \
    r-base

cat <<EOS | R --vanilla
install.packages(
  c('repr', 'IRdisplay', 'evaluate', 'crayon', 'pbdZMQ', 'devtools', 'uuid', 'digest'),
  repos='http://cran.ism.ac.jp/'
)
devtools::install_github('IRkernel/IRkernel')
IRkernel::installspec()
if ('0.5.0' == packageVersion('IRdisplay')) { # has bug
  devtools::install_github('IRkernel/IRdisplay')
}
install.packages('rstan', repos='http://cran.ism.ac.jp/', dependencies=TRUE)
install.packages('ggmap', repos='http://cran.ism.ac.jp/', dependencies=TRUE)
install.packages(
  c('ggplot2', 'tidyr', 'dplyr', 'ggmcmc'),
  repos='http://cran.ism.ac.jp/'
)
