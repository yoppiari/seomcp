# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript using node directly
RUN node node_modules/typescript/bin/tsc

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy public folder
COPY public ./public

# Expose port
EXPOSE 4000

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Start the server
CMD ["node", "dist/index.js"]
