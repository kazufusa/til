FROM node:16-buster-slim AS deps

RUN npm install --global pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


FROM node:16-buster-slim AS builder

RUN npm install --global pnpm
WORKDIR /app

COPY Table.tsx next-env.d.ts next.config.js package.json pnpm-lock.yaml tsconfig.json ./
COPY pages ./pages
COPY public ./public
COPY styles ./styles
COPY --from=deps /app/node_modules ./node_modules

RUN --mount=type=secret,id=NEXT_PUBLIC_SECRET_KEY \
  echo NEXT_PUBLIC_SECRET_KEY=$(cat /run/secrets/NEXT_PUBLIC_SECRET_KEY) >> .env

RUN pnpm build

FROM gcr.io/distroless/nodejs:16 AS runner

WORKDIR /app
ENV NODE_ENV production

COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/.env ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./

EXPOSE 3000

CMD ["server.js"]
