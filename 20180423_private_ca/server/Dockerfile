FROM ubuntu
RUN apt-get update && apt-get install -y apache2
COPY index.html /var/www/html/index.html
COPY ssl.conf /etc/apache2/sites-available/ssl.conf
COPY cert.pem /etc/apache2/cert.pem
COPY nokey.pem /etc/apache2/nokey.pem
COPY cacert.pem /etc/apache2/cacert.pem
RUN a2ensite ssl
RUN a2enmod ssl
CMD ["/usr/sbin/apache2ctl", "-D", "FOREGROUND"]

# SSLCertificateFile "/path/to/svcert.pem"
# SSLCertificateKeyFile "/path/to/svkey.pem"
