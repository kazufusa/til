FROM ubuntu:14.04

# preparements
RUN sed -i.bak -e "s%http://archive.ubuntu.com/ubuntu/%http://ftp.iij.ad.jp/pub/linux/ubuntu/archive/%g" /etc/apt/sources.list \
 && apt-get update && apt-get install -y \
    openssh-server \
    openssh-client \
    libopenmpi-dev \
    openmpi-bin \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# change root password
RUN echo 'root:root' | chpasswd

# add working user
RUN useradd -m user \
    && echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && echo 'user:user' | chpasswd

# preparements for sshd
RUN mkdir /var/run/sshd

# ssh
USER user
WORKDIR /home/user
ENV HOME /home/user
RUN mkdir .ssh && chmod 700 .ssh
COPY ./id_rsa /home/user/.ssh/id_rsa
COPY ./id_rsa.pub /home/user/.ssh/authorized_keys
RUN echo "host *" > /home/user/.ssh/config \
  && echo "StrictHostKeyChecking no" >> /home/user/.ssh/config

USER root
RUN chown user /home/user/.ssh/id_rsa \
  && chown user /home/user/.ssh/authorized_keys \
  && chmod 600 /home/user/.ssh/id_rsa \
  && chmod 600 /home/user/.ssh/authorized_keys \
  && chmod 600 /home/user/.ssh/config

# compile sample code
COPY ./mpi-ping.c mpi-ping.c
COPY ./run.sh run.sh
RUN mpicc -O3 -o mpi-ping mpi-ping.c

# start sshd
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
