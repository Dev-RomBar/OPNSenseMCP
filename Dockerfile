# Fork: build with bun (the lockfile is bun.lock), run with Node.
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY src ./src
RUN bun run build \
 && rm -rf node_modules \
 && bun install --frozen-lockfile --production --ignore-scripts

FROM node:24-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production MCP_TRANSPORT=streamable-http MCP_SSE_PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "dist/index.js"]
