FROM centos:7

RUN yum install -y \
  git \
  zlib \
  zlib-devel \
  gcc-c++ \
  patch \
  readline \
  readline-devel \
  libyaml-devel \
  libffi-devel \
  openssl-devel \
  make \
  bzip2 \
  autoconf \
  automake \
  libtool \
  bison \
  curl \
  sqlite-devel \


RUN git clone https://github.com/anyenv/anyenv /opt/anyenv
RUN echo 'set -xe && \
	git clone https://github.com/anyenv/anyenv /opt/anyenv && \
	export PATH="/opt/anyenv/bin:$PATH" && \
	eval "$(anyenv init -)" && \
	yes | anyenv install --init && \
	anyenv install rbenv && \
	anyenv install pyenv' | bash

RUN echo 'export PATH="/opt/anyenv/bin:$PATH"' > /etc/profile.d/anyenv.sh
RUN echo 'eval "$(anyenv init -)"' >> /etc/profile.d/anyenv.sh

RUN bash -lc "rbenv install 2.6.3 && rbenv global 2.6.3"
RUN bash -lc "pyenv install 3.7.10 && pyenv global 3.7.10"
