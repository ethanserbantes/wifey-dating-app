# Use Node.js LTS as base (Bun has better Node.js compatibility than using pure Bun image for prod)
FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

# Install bun
RUN npm install -g bun

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Production stage
FROM base AS runner
WORKDIR /app

# Install bun globally
RUN npm install -g bun

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 honoserver

# Copy node_modules from deps
COPY --from=deps --chown=honoserver:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=honoserver:nodejs . .

# Build the application
RUN bun run build

# Create .react-router directory with proper permissions
RUN mkdir -p .react-router && chown -R honoserver:nodejs .react-router

USER honoserver

EXPOSE 3000

# Start the production server
CMD ["node", "server.js"]
