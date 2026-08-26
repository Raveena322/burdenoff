FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Copy dependency manifests and prisma schema
COPY package.json bun.lock* package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Generate Prisma Client
RUN bun run gendb

# Copy remaining application source code
COPY . .

# Expose GraphQL API port
EXPOSE 4000

ENV PORT=4000
CMD ["bun", "run", "start"]
