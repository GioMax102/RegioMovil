FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/data/regiomovil.sqlite
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/data ./data
COPY --from=build /app/models ./models
COPY --from=build /app/scripts/admin-user.mjs ./scripts/admin-user.mjs
COPY --from=build /app/scripts/backup-reports.mjs ./scripts/backup-reports.mjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
VOLUME ["/data"]
CMD ["node", "server/index.mjs"]
