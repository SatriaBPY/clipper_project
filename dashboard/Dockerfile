FROM node:20-alpine

WORKDIR /app

# Copy package.json
COPY dashboard/package*.json ./

# Install dependencies
RUN npm install

# Copy dashboard files
COPY dashboard/ ./

# Build Next.js
RUN npm run build

EXPOSE 3000
ENV PORT 3000

CMD ["npm", "start"]
