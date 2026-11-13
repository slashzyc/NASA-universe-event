FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 LUNAMARGIN_DATA_DIR=/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4173
CMD ["node", "server/index.mjs"]
