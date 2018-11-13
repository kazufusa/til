FROM python:latest
RUN sed -i.bak -e "s%http://archive.ubuntu.com/ubuntu/%http://ftp.iij.ad.jp/pub/linux/ubuntu/archive/%g" /etc/apt/sources.list \
  && apt-get update && apt-get install -y \
      cron \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime

RUN sed -i -e '/pam_loginuid.so/s/^/#/' /etc/pam.d/cron
ADD cron.d /etc/cron.d/
RUN chmod 0644 /etc/cron.d/*
RUN touch /tmp/crontest.txt

CMD /usr/sbin/cron && tail -f /dev/null
