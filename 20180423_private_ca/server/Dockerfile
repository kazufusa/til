FROM ubuntu
RUN apt-get update && apt-get install -y apache2
COPY index.html /var/www/html/index.html
COPY ssl.conf /etc/apache2/sites-available/ssl.conf
COPY svcert.pem /etc/apache2/svcert.pem
COPY svkey.pem /etc/apache2/svkey.pem
RUN a2ensite ssl
RUN a2enmod ssl
CMD ["/usr/sbin/apache2ctl", "-D", "FOREGROUND"]

# SSLCertificateFile "/path/to/svcert.pem"
# SSLCertificateKeyFile "/path/to/svkey.pem"
