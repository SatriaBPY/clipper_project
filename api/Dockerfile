FROM node:20-alpine

RUN apk add --no-cache libc6-compat openssl1.1-compat

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

# Copy actual API source files
COPY api/ ./api/

# Build the API
WORKDIR /usr/src/app/api
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
