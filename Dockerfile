FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY back-office/package*.json ./back-office/
RUN npm ci --ignore-scripts && npm run install:console
COPY . .
RUN npm run build && npm prune --omit=dev && rm -rf back-office/node_modules
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV CREDITS_CONSOLE_DIRECTORY=/app/back-office/dist
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node", "dist/server.js"]
