# backend/Dockerfile
FROM node:22.12.0-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy backend source code
COPY . .

# Expose port
EXPOSE 5000

# Start backend
CMD ["node", "src/app.js"]