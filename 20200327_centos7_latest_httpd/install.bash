#!/bin/sh
# https://w.atwiki.jp/sanosoft/pages/92.html
set -ex

yum install -y yum-utils
yum install -y https://repo.ius.io/ius-release-el7.rpm || :
yum-config-manager --disable epel ius
yum update -y
yum install -y httpd httpd-devel mod_ssl
cp -r /etc/httpd/conf.d/ ./httpd.conf.d
echo AAA >> /etc/httpd/conf/httpd.conf
cp /etc/httpd/conf/httpd.conf ./httpd.httpd.conf

# There are unfinished transactions remaining. You might consider running
# yum-complete-transaction, or "yum-complete-transaction --cleanup-only" and
# "yum history redo last", first to finish them. If those don't work you'll
# have to try removing/installing packages by hand (maybe package-cleanup can help).
# yum-complete-transaction --cleanup-only && yum history redo last

yum install -y mailcap expat-devel perl openldap-devel openssl libdb-devel
yum remove -y httpd httpd-devel httpd-tools mod_ssl
yum install -y httpd24u httpd24u-devel httpd24u-mod_ssl --disablerepo=base,extras,updates --enablerepo=ius,epel
cp /etc/httpd/conf/httpd.conf ./httpd24u.httpd.conf
cp -r /etc/httpd/conf.d/ ./httpd24u.conf.d
