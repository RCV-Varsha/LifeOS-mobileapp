FROM node:22-bookworm-slim AS web
WORKDIR /build/app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
ENV EXPO_OFFLINE=1
RUN npm run build:web -- --clear

FROM node:22-bookworm-slim AS runtime
WORKDIR /lifeos/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY --from=web /build/app/dist-web /lifeos/app/dist-web
ENV NODE_ENV=production AUTH_MODE=session SERVE_WEB=1 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/server.ts"]
