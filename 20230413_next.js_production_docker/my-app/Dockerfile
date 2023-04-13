# Node 16.x
ARG NODE_VERSION=18

FROM gcr.io/distroless/nodejs:$NODE_VERSION

WORKDIR /app

COPY ./next.config.js .
COPY ./public ./public
COPY ./.next/static ./.next/static

COPY ./.next/standalone .

CMD ["server.js"]
