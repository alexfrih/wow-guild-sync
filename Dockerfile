# 🏰 Pool Party Guild Sync Service
# Multi-stage Docker build for optimal size and security

# Build stage
FROM node:22-alpine AS builder

# Suppress npm update notifications
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Runtime stage  
FROM node:22-alpine AS runtime

# Suppress npm update notifications
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Install runtime dependencies
RUN apk add --no-cache sqlite tini

# Create non-root user
RUN addgroup -g 1001 -S guilduser && \
    adduser -S guilduser -u 1001 -G guilduser

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY src ./src
COPY prisma ./prisma
COPY package.json ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && \
    chown -R guilduser:guilduser /app

# Switch to non-root user
USER guilduser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node src/health-check.js || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the service
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && exec node src/index.js"]

# Expose health check port (optional)
EXPOSE 3001

# Labels
LABEL org.opencontainers.image.title="Pool Party Guild Sync"
LABEL org.opencontainers.image.description="Autonomous WoW guild sync service"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Pool Party Guild"