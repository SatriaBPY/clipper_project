FROM node:20-alpine

# Install system dependencies needed for video processing and Prisma
RUN apk add --no-cache ffmpeg yt-dlp python3 libc6-compat openssl1.1-compat

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
