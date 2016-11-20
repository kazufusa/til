FROM centos

# preparements
RUN yum -y install initscripts MAKEDEV
RUN yum check
RUN yum -y update
RUN yum -y install gcc
RUN yum clean all

WORKDIR /prime
COPY ./prime.c prime.c
COPY ./prime.sh prime.sh

CMD ["tail", "-f", "/dev/null"]
