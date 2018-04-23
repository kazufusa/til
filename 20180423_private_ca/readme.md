# how to use

```
$ sh newca.sh # make new ca
$ sh newsv.sh # generate new client certification
```

## files

- CA/cacert.crt
- svkey.pem
- svcert.pem

## Apache

```httpd.conf
SSLCertificateFile "/path/to/svcert.pem"
SSLCertificateKeyFile "/path/to/svkey.pem"
```

## nginx

```
ssl on;
ssl_certificate /path/to/svcert.pem;
ssl_certificate_key /path/to/svkey.pem;
```
