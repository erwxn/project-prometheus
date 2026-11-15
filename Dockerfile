# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY .husky/install.mjs ./.husky/install.mjs
RUN npm ci

FROM dependencies AS client-build
ENV VITE_OBSERVATION_SOURCE=snapshot
COPY shared/ ./shared/
COPY client/ ./client/
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --workspace=server --include-workspace-root=false

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY server/ ./server/
COPY deploy/backend/gold_reader.mjs ./deploy/backend/gold_reader.mjs
COPY shared/ ./shared/
COPY docker/smoke.cjs ./docker-smoke.cjs
COPY test-data/harmonized/delivery_2014_morocco.zip ./test-data/harmonized/delivery_2014_morocco.zip
RUN mkdir -p /app/server/data && chown node:node /app/server/data
USER node
EXPOSE 5000
CMD ["node", "server/index.js"]

FROM nginx:stable-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/client/dist /usr/share/nginx/html
EXPOSE 80
