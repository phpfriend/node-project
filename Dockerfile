FROM node:22.12.0-alpine
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy backend source
COPY backend/. .

# Expose backend port
EXPOSE 5000

# Start backend
CMD ["node", "server.js"]