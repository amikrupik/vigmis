FROM node:20-alpine

WORKDIR /app

# Copy workspace manifests (root + all packages)
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ad-connectors/package.json ./packages/ad-connectors/
COPY packages/ai-router/package.json ./packages/ai-router/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/

# Install all deps (workspace-aware from root, includes devDeps for tsx)
RUN npm ci

# Copy source code
COPY apps/api/src ./apps/api/src
COPY packages ./packages

EXPOSE 4000
ENV HOST=0.0.0.0

# Run with tsx — handles TypeScript + workspace packages at runtime
CMD ["node", "--import", "tsx/esm", "apps/api/src/server.ts"]
