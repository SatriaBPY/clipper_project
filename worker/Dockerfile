FROM node:20-slim

# Install system dependencies needed for video processing and Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    openssl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy root package files
COPY package*.json ./

# Copy packages' package.json
COPY api/package*.json ./api/
COPY worker/package*.json ./worker/
COPY prisma/schema.prisma ./prisma/

# Install dependencies for workspace
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy actual Worker source files
COPY worker/ ./worker/

# Build the Worker
WORKDIR /usr/src/app/worker
RUN npm run build

CMD ["npm", "start"]
