FROM denoland/deno:alpine-1.43.5

WORKDIR /app

COPY ./app /app/

RUN deno cache main.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
