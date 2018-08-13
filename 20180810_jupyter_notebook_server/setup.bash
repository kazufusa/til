#!/bin/bash
set -Ceux

if [ -d $HOME/.anyenv ] ; then
  export PATH=$HOME/.anyenv/bin:$PATH
  eval "$(anyenv init -)"
else
  git clone https://github.com/riywo/anyenv $HOME/.anyenv
  git clone https://github.com/znz/anyenv-update.git $HOME/.anyenv/plugins/anyenv-update
  export PATH=$HOME/.anyenv/bin:$PATH
  eval "$(anyenv init -)"
  anyenv update
  anyenv install pyenv
  eval "$(anyenv init -)"
  pyenv install 3.6.6
  pyenv rehash

cat <<EOS >> $HOME/.bashrc
if [ -d \$HOME/.anyenv ] ; then
  export PATH=\$HOME/.anyenv/bin:\$PATH
  eval "\$(anyenv init -)"
fi
EOS
fi

pip install --upgrade pip
pip install -r requirements.txt

# ---------------------------------------------
#  The libgit2 library that is required to build git2r was not found.
#
#  Please install:
#    libgit2-dev   (package on e.g. Debian and Ubuntu)
#    libgit2-devel (package on e.g. Fedora, CentOS and RHEL)
#    libgit2       (Homebrew package on macOS)
cat <<EOS | R --vanilla
install.packages(
  c('repr', 'IRdisplay', 'evaluate', 'crayon', 'pbdZMQ', 'devtools', 'uuid', 'digest', # for jupyter
  'rstan', 'ggplot2', 'tidyr', 'dplyr', 'ggmcmc'
  ),
  repos="http://cran.ism.ac.jp/"
)
devtools::install_github('IRkernel/IRkernel')
IRkernel::installspec()
if ('0.5.0' == packageVersion('IRdisplay')) { # has bug
  devtools::install_github('IRkernel/IRdisplay')
}
EOS
