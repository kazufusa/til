FROM centos

# preparements
RUN yum -y install initscripts MAKEDEV
RUN yum check
RUN yum -y update
RUN yum -y install openssh-server openssh-clients
RUN yum clean all

# change root password
RUN echo 'root:root' | chpasswd

# add working user
RUN useradd -m user \
    && echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && echo 'user:user' | chpasswd

# preparements for sshd
RUN mkdir /var/run/sshd
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key

# ssh
USER user
WORKDIR /home/user
ENV HOME /home/user
RUN mkdir .ssh
RUN chmod 700 .ssh
COPY ./id_rsa /home/user/.ssh/id_rsa
COPY ./id_rsa.pub /home/user/.ssh/authorized_keys
RUN echo "host *" > /home/user/.ssh/config
RUN echo "StrictHostKeyChecking no" >> /home/user/.ssh/config

USER root
RUN chown user /home/user/.ssh/id_rsa
RUN chown user /home/user/.ssh/authorized_keys
RUN chmod 600 /home/user/.ssh/id_rsa
RUN chmod 600 /home/user/.ssh/authorized_keys
RUN chmod 600 /home/user/.ssh/config

# start sshd
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
