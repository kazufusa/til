# app/Dockerfile
FROM public.ecr.aws/docker/library/python:3.12-alpine
RUN adduser -D -u 10001 app
COPY server.py /app/server.py
USER app
EXPOSE 8080
CMD ["python", "-u", "/app/server.py"]
