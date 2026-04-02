# backend/Dockerfile
FROM node:22.12.0-alpine

WORKDIR /app

# Copy package.json and package-lock.json (no folder prefix)
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the backend code
COPY . .

# Expose port
EXPOSE 5000

# Start backend
CMD ["node", "server.js"]   # Replace server.js with your main file if different