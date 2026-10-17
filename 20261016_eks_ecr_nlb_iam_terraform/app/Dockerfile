# app/Dockerfile
FROM public.ecr.aws/docker/library/busybox:1.36
COPY index.html /www/index.html
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
