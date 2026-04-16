FROM node:22-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages/core/package.json packages/core/
COPY packages/agents/package.json packages/agents/
COPY packages/cli/package.json packages/cli/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/plugins/package.json packages/plugins/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY templates/ templates/

# Build all packages
RUN pnpm build

# Data directory
VOLUME /var/lib/galaxia

# Config mount point
VOLUME /etc/galaxia

ENV NODE_ENV=production
ENV GALAXIA_DATA_DIR=/var/lib/galaxia
ENV GALAXIA_CONFIG=/etc/galaxia/config.yml

EXPOSE 3333

CMD ["node", "packages/core/dist/index.js"]
