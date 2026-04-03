# Docker Health Check Complete Guide
## Understanding Health Checks, Localhost, and Container Networking

---

## Table of Contents

1. [Understanding Localhost in Docker](#understanding-localhost-in-docker)
2. [Dockerfile Line-by-Line Explanation](#dockerfile-line-by-line-explanation)
3. [Health Check Deep Dive](#health-check-deep-dive)
4. [Implementing Health Checks](#implementing-health-checks)
5. [Testing Health Checks](#testing-health-checks)
6. [Alternative Methods](#alternative-health-check-methods)
7. [Common Issues & Solutions](#common-issues--solutions)
8. [Production Best Practices](#production-best-practices)
9. [Quick Reference](#quick-reference)

---

## Understanding Localhost in Docker

### How Docker Networking Works

Each Docker container has its **own isolated network namespace**:

```
┌─────────────────────────────────────┐
│  Your Computer (Host)               │
│                                     │
│  localhost:5000 ← Host's localhost  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Docker Container            │  │
│  │                              │  │
│  │  localhost:5000 ← Container's│  │
│  │  OWN localhost               │  │
│  │                              │  │
│  │  Your Express App running    │  │
│  │  on 0.0.0.0:5000            │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Key Concepts

**1. Container Localhost vs Host Localhost**

```bash
# From your computer (host)
curl http://localhost:5000
# ❌ This accesses HOST's localhost
# Won't reach container unless port is mapped with -p 5000:5000

# Inside container
docker exec container-name curl http://localhost:5000
# ✅ This accesses CONTAINER's localhost
# Reaches the app running inside
```

**2. Health Check Runs INSIDE the Container**

```dockerfile
HEALTHCHECK CMD node -e "require('http').get('http://localhost:5000/health', ...)"
```

- This command executes **inside the container**
- `localhost:5000` refers to **container's localhost**
- Your Express app and health check are in the **same container**
- Therefore, it works! ✅

**3. Network Binding: 0.0.0.0 vs 127.0.0.1**

```javascript
// ✅ CORRECT - Bind to all interfaces
app.listen(5000, '0.0.0.0', () => {
  console.log('Server on 0.0.0.0:5000');
});

// ❌ WRONG - Only accessible from 127.0.0.1
app.listen(5000, 'localhost', () => {
  console.log('Server on localhost:5000');
});

// ⚠️ WORKS but less explicit
app.listen(5000, () => {
  console.log('Server on port 5000');
  // Defaults to 0.0.0.0 in most cases
});
```

**Why 0.0.0.0?**
- `0.0.0.0` = Listen on ALL network interfaces
- `127.0.0.1` or `localhost` = Listen only on loopback interface
- In Docker, you want the app accessible from within container and from outside (when port is mapped)

---

## Dockerfile Line-by-Line Explanation

### Your Backend Dockerfile

```dockerfile
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
```

---

### Line 1: Base Image

```dockerfile
FROM node:22.12.0-alpine
```

**What it does:**
- Downloads and uses Node.js version 22.12.0 on Alpine Linux as the base
- Alpine Linux is a minimal distribution (~5MB vs ~900MB for Ubuntu)

**Why Alpine?**
- ✅ Smaller image size (faster downloads, less storage)
- ✅ Fewer security vulnerabilities (minimal attack surface)
- ✅ Faster builds and deployments
- ⚠️ Uses `musl` instead of `glibc` (rarely causes compatibility issues)

**Alternatives:**
```dockerfile
FROM node:22.12.0              # Regular Debian-based (~900MB)
FROM node:22.12.0-slim         # Slimmed Debian (~200MB)
FROM node:22.12.0-alpine       # Alpine Linux (~50MB) ✅ Best for production
```

---

### Line 2: Working Directory

```dockerfile
WORKDIR /app
```

**What it does:**
- Creates `/app` directory inside container (if doesn't exist)
- Sets it as current working directory for all subsequent commands
- All `COPY`, `RUN`, `CMD` execute from `/app`

**Container filesystem after this:**
```
/
├── app/           ← You are here (working directory)
├── bin/
├── etc/
├── home/
├── lib/
├── usr/
└── var/
```

**Example of how it affects commands:**
```dockerfile
WORKDIR /app
COPY package.json .     # Copies to /app/package.json
RUN npm install         # Runs in /app, creates /app/node_modules
CMD ["node", "index.js"] # Runs from /app
```

**Without WORKDIR:**
```dockerfile
# ❌ Without WORKDIR - messy!
COPY package.json /app/package.json
RUN cd /app && npm install
CMD ["node", "/app/index.js"]
```

---

### Line 3: Copy Package Files

```dockerfile
COPY package*.json ./
```

**What it does:**
- Copies files matching `package*.json` from host to container
- `*` is a wildcard that matches any characters
- `./` means current directory (`/app`)

**Files matched:**
- ✅ `package.json`
- ✅ `package-lock.json`
- ✅ `package-something.json` (if exists)
- ❌ `package.txt` (doesn't end with .json)

**Before:**
```
Host Machine:
/backend/
├── package.json
├── package-lock.json
├── src/
└── node_modules/
```

**After:**
```
Container:
/app/
├── package.json       ← Copied
├── package-lock.json  ← Copied
```

**Why copy package files separately BEFORE source code?**

🔑 **Docker Layer Caching!**

Docker builds images in layers. Each instruction creates a new layer:

```
Layer 1: FROM node:22.12.0-alpine
Layer 2: WORKDIR /app
Layer 3: COPY package*.json ./        ← Package layer
Layer 4: RUN npm install              ← Dependencies layer (SLOW)
Layer 5: COPY . .                     ← Source code layer
Layer 6: CMD ["node", "src/app.js"]
```

**Scenario 1: You modify source code (src/app.js)**
```
Layer 1-4: ✅ Use cached (no reinstall!)
Layer 5-6: ❌ Rebuild (fast, just copy code)

Build time: ~5 seconds
```

**Scenario 2: You modify package.json**
```
Layer 1-2: ✅ Use cached
Layer 3-6: ❌ Rebuild (npm install runs again)

Build time: ~2 minutes
```

**If you copied everything at once:**
```dockerfile
# ❌ BAD - No caching benefit
COPY . .
RUN npm install

# Every code change = Full npm install!
```

---

### Line 4: Install Dependencies

```dockerfile
RUN npm install --legacy-peer-deps
```

**What it does:**
- `RUN` executes command during image build
- `npm install` reads package.json and installs all dependencies
- `--legacy-peer-deps` bypasses strict peer dependency checking

**What happens:**
```
1. Reads package.json
2. Resolves dependency tree
3. Downloads packages from npm registry
4. Installs to /app/node_modules/
5. Creates/updates package-lock.json
```

**After this step:**
```
/app/
├── package.json
├── package-lock.json
└── node_modules/        ← Created
    ├── express/
    ├── mongoose/
    ├── cors/
    └── ... all dependencies
```

**Why `--legacy-peer-deps`?**

npm 7+ enforces strict peer dependency checking. This causes errors when:
- Package A requires `react@^18.0.0`
- Package B requires `react@^16.0.0`
- You have `react@19.0.0` installed

**Your case:**
```
react-tinder-card requires react@"^16.8.0 || ^17.0.0 || ^18.0.0"
You have: react@19.2.4
Error: ERESOLVE unable to resolve dependency tree
```

`--legacy-peer-deps` ignores this conflict and installs anyway.

**Production alternative:**
```dockerfile
# Better for production - deterministic installs
RUN npm ci --only=production --legacy-peer-deps

# ci = clean install (faster, stricter)
# --only=production = skip devDependencies
```

**Comparison:**
```
npm install:
- Installs from package.json
- Updates package-lock.json
- Installs devDependencies too
- Use in development

npm ci:
- Installs from package-lock.json (exact versions)
- Faster, more reliable
- Fails if package.json and lock are out of sync
- Use in production/CI ✅
```

---

### Line 5: Copy Source Code

```dockerfile
COPY . .
```

**What it does:**
- First `.` = Source (current directory on host = `/backend`)
- Second `.` = Destination (current directory in container = `/app`)
- Copies everything from backend folder to container

**What gets copied:**
```
/backend/src/          → /app/src/
/backend/routes/       → /app/routes/
/backend/models/       → /app/models/
/backend/controllers/  → /app/controllers/
/backend/middleware/   → /app/middleware/
/backend/.env          → /app/.env
/backend/server.js     → /app/server.js
... everything
```

**What gets EXCLUDED (via .dockerignore):**
```
node_modules/    ✅ Not copied (already installed in container)
.git/            ✅ Not needed in production
.env.local       ✅ Sensitive, use environment variables
*.log            ✅ Log files
coverage/        ✅ Test artifacts
dist/            ✅ Build artifacts
.vscode/         ✅ Editor config
```

**Create .dockerignore file:**
```
# backend/.dockerignore
node_modules
npm-debug.log
.env
.env.local
.env.development
.env.test
.git
.gitignore
README.md
.DS_Store
*.md
.vscode
.idea
coverage
.nyc_output
dist
build
```

**Final container structure:**
```
/app/
├── node_modules/        ← From npm install
├── src/
│   ├── app.js
│   ├── routes/
│   ├── models/
│   └── controllers/
├── package.json
├── package-lock.json
└── .env
```

---

### Line 6: Expose Port

```dockerfile
EXPOSE 5000
```

**What it does:**
- Documents that container listens on port 5000
- **Metadata only** - doesn't actually publish/open the port
- Informs developers and tools which port to use

**Important: EXPOSE ≠ Publish**

```dockerfile
# In Dockerfile
EXPOSE 5000           # Documentation only

# To actually publish the port:
docker run -p 5000:5000 my-image
#          ↑ This actually maps the port

# In docker-compose.yml
ports:
  - "5000:5000"      # This actually maps the port
```

**Port mapping explained:**
```
-p HOST_PORT:CONTAINER_PORT

-p 5000:5000   # Host port 5000 → Container port 5000
-p 8080:5000   # Host port 8080 → Container port 5000
-p 5000:3000   # Host port 5000 → Container port 3000
```

**What happens in your Express app:**
```javascript
// Your app must listen on this port
app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});

// Port 5000 INSIDE the container
// Matches EXPOSE 5000 in Dockerfile
```

**Multiple ports example:**
```dockerfile
EXPOSE 5000    # Main API
EXPOSE 5001    # WebSocket
EXPOSE 9090    # Metrics endpoint
```

---

### Line 7: Startup Command

```dockerfile
CMD ["node", "src/app.js"]
```

**What it does:**
- Defines default command to run when container starts
- Uses JSON array format (exec form - preferred)
- Equivalent to running `node src/app.js` in terminal

**Exec form vs Shell form:**

```dockerfile
# Exec form (recommended) ✅
CMD ["node", "src/app.js"]
# Direct execution: PID 1 is node process
# Better signal handling (SIGTERM, SIGINT)
# No shell overhead

# Shell form
CMD node src/app.js
# Runs via shell: /bin/sh -c "node src/app.js"
# Shell is PID 1, node is child process
# Worse signal handling
```

**Why exec form is better:**

```bash
# With exec form:
docker stop backend
# Docker sends SIGTERM to node process (PID 1)
# Node can gracefully shutdown (close connections, finish requests)
# Shutdown time: ~1-2 seconds

# With shell form:
docker stop backend
# Docker sends SIGTERM to shell (PID 1)
# Shell doesn't forward signal to node
# Docker waits 10 seconds, then forcefully kills (SIGKILL)
# Shutdown time: 10 seconds (timeout)
```

**Container lifecycle:**

```
1. docker run my-backend
2. Docker creates container
3. Docker executes: node src/app.js
4. Your Express app starts
5. Container stays running while app runs
6. If app crashes, container stops
7. docker stop → sends SIGTERM → graceful shutdown
```

**CMD vs ENTRYPOINT:**

```dockerfile
# CMD - Can be overridden
CMD ["node", "src/app.js"]
docker run my-backend node src/other.js  # Override CMD

# ENTRYPOINT - Cannot be overridden (without --entrypoint)
ENTRYPOINT ["node"]
CMD ["src/app.js"]
docker run my-backend src/other.js  # Runs: node src/other.js

# Best practice for flexibility: Use CMD
```

---

## Health Check Deep Dive

### What is a Health Check?

A health check is a command that Docker runs periodically to verify if a container is working properly.

**Without health check:**
```
Container running = Healthy ✅
Container stopped = Unhealthy ❌

# Problem: App might be running but broken (DB disconnected, infinite loop, etc.)
```

**With health check:**
```
Container running + Health check passing = Healthy ✅
Container running + Health check failing = Unhealthy ⚠️
Container stopped = Dead ❌
```

---

### Health Check Syntax

```dockerfile
HEALTHCHECK [OPTIONS] CMD command

HEALTHCHECK --interval=30s \
            --timeout=3s \
            --start-period=40s \
            --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

---

### Health Check Options Explained

**1. `--interval=30s`**
```
How often to run the health check

--interval=30s   → Check every 30 seconds
--interval=1m    → Check every 1 minute
--interval=10s   → Check every 10 seconds (more frequent)
```

**Timeline example with `--interval=30s`:**
```
0s:   Container starts
40s:  First health check (after start-period)
70s:  Second health check (40s + 30s)
100s: Third health check (70s + 30s)
```

---

**2. `--timeout=3s`**
```
Maximum time to wait for health check response

--timeout=3s   → Wait max 3 seconds
--timeout=10s  → Wait max 10 seconds

If health check doesn't respond within timeout:
→ Considered failed
→ Counts toward --retries
```

**Example:**
```dockerfile
HEALTHCHECK --timeout=3s CMD curl http://localhost:5000/health

# If endpoint takes 5 seconds to respond:
# Health check times out after 3 seconds → Failed ❌
```

---

**3. `--start-period=40s`**
```
Grace period before health checks count as failures

--start-period=40s → Ignore failures for first 40 seconds
--start-period=1m  → Ignore failures for first 1 minute

Purpose: Give app time to start up
```

**Why it's needed:**

```
Container lifecycle:
0s:   Container starts
0-10s:  Node.js loads
10-20s: Connects to MongoDB
20-30s: Loads configuration
30-40s: Server starts listening
40s+:   App fully ready ✅

Without start-period:
5s: Health check fails (app not ready yet) ❌
10s: Health check fails ❌
15s: Health check fails ❌
→ Container marked unhealthy too early!

With --start-period=40s:
5s: Health check runs but failure ignored ✅
10s: Health check runs but failure ignored ✅
15s: Health check runs but failure ignored ✅
40s+: Health checks count normally ✅
```

**How to determine start-period:**
```bash
# Time how long your app takes to start
time node src/app.js

# Typical startup times:
Simple Express app: 1-5 seconds → --start-period=10s
With database: 5-20 seconds → --start-period=30s
With migrations: 20-60 seconds → --start-period=60s
Heavy initialization: 1-3 minutes → --start-period=2m
```

---

**4. `--retries=3`**
```
Number of consecutive failures before marking unhealthy

--retries=3 → 3 failures in a row = unhealthy
--retries=1 → 1 failure = unhealthy (very strict)
--retries=5 → 5 failures = unhealthy (more tolerant)
```

**Example with `--retries=3`:**

```
Check 1: Pass ✅ → Status: healthy
Check 2: Pass ✅ → Status: healthy
Check 3: Fail ❌ → Status: healthy (1/3 failures)
Check 4: Fail ❌ → Status: healthy (2/3 failures)
Check 5: Fail ❌ → Status: unhealthy (3/3 failures)
Check 6: Pass ✅ → Status: healthy (resets counter)
```

**Why use retries?**
- Prevents marking unhealthy due to temporary issues
- Network hiccups
- Brief database connection drops
- Momentary high load

---

### Complete Health Check Example

```dockerfile
FROM node:22.12.0-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

COPY . .

EXPOSE 5000

# Health check with all options
HEALTHCHECK --interval=30s \
            --timeout=3s \
            --start-period=40s \
            --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/app.js"]
```

**What this does:**

```
1. Every 30 seconds, run health check
2. If check doesn't respond within 3 seconds → failed
3. Ignore failures for first 40 seconds (startup time)
4. After 3 consecutive failures → mark unhealthy
5. Health check: GET http://localhost:5000/health
6. If status code 200 → exit 0 (success)
7. If not 200 → exit 1 (failure)
```

---

### Health Check Command Explained

```dockerfile
CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

**Breaking it down:**

```javascript
node -e "..."
// -e = evaluate JavaScript code inline

require('http').get('http://localhost:5000/health', (r) => {
  // Make HTTP GET request to localhost:5000/health
  // r = response object
  
  process.exit(r.statusCode === 200 ? 0 : 1)
  // If status code is 200 → exit with code 0 (success)
  // If status code is not 200 → exit with code 1 (failure)
})
```

**Exit codes:**
```
Exit code 0 = Success → Health check passes ✅
Exit code 1 = Failure → Health check fails ❌
Exit code 2+ = Error → Health check fails ❌
```

**Full example with error handling:**

```javascript
const http = require('http');

const options = {
  host: 'localhost',
  port: 5000,
  path: '/health',
  timeout: 2000
};

const request = http.get(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);  // Success
  } else {
    console.log(`Health check failed with status ${res.statusCode}`);
    process.exit(1);  // Failure
  }
});

request.on('error', (err) => {
  console.log(`Health check error: ${err.message}`);
  process.exit(1);  // Failure
});

request.on('timeout', () => {
  console.log('Health check timeout');
  request.destroy();
  process.exit(1);  // Failure
});
```

---

## Implementing Health Checks

### Step 1: Create Health Endpoint in Backend

**File: `backend/src/app.js`**

```javascript
const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Your other routes...

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================

// Simple health check (no dependencies)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Advanced health check (with database)
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbState = mongoose.connection.readyState;
    
    // readyState values:
    // 0 = disconnected
    // 1 = connected
    // 2 = connecting
    // 3 = disconnecting
    
    if (dbState !== 1) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        dbState: dbState,
        timestamp: new Date()
      });
    }
    
    // Optionally ping database
    await mongoose.connection.db.admin().ping();
    
    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Start server on 0.0.0.0 (important for Docker!)
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

module.exports = app;
```

**HTTP Status Codes:**
```
200 = OK → Healthy ✅
503 = Service Unavailable → Unhealthy ❌
500 = Internal Server Error → Unhealthy ❌
```

---

### Step 2: Update Dockerfile

```dockerfile
FROM node:22.12.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s \
            --timeout=3s \
            --start-period=40s \
            --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/app.js"]
```

---

### Step 3: Update docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: devtinder-backend
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - JWT_SECRET=${JWT_SECRET}
      - PORT=5000
    networks:
      - app-network
    restart: unless-stopped
    # Health check (can override Dockerfile settings)
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: devtinder-frontend
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy  # Wait for backend to be healthy!
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
```

**Key feature:**
```yaml
depends_on:
  backend:
    condition: service_healthy
```

This ensures frontend only starts after backend health check passes!

---

## Testing Health Checks

### Method 1: Manual Test from Host

```bash
# Start containers
docker-compose up -d

# Test health endpoint from your computer
curl http://localhost:5000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-04-03T10:30:00.000Z",
  "uptime": 45.123,
  "database": "connected"
}
```

---

### Method 2: Test Inside Container

```bash
# Execute health check command inside container
docker exec devtinder-backend \
  node -e "require('http').get('http://localhost:5000/health', (r) => {console.log('Status:', r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1)})"

# Check exit code
echo $?
# Output:
# 0 = healthy ✅
# 1 = unhealthy ❌
```

---

### Method 3: Check Docker Health Status

```bash
# View container status
docker ps

# Output shows health status:
CONTAINER ID   IMAGE     STATUS
abc123         backend   Up 5 minutes (healthy)

# Detailed health information
docker inspect devtinder-backend | grep -A 20 Health

# Output:
"Health": {
  "Status": "healthy",
  "FailingStreak": 0,
  "Log": [
    {
      "Start": "2026-04-03T10:30:00.000Z",
      "End": "2026-04-03T10:30:01.123Z",
      "ExitCode": 0,
      "Output": ""
    }
  ]
}
```

---

### Method 4: Watch Health Status in Real-Time

```bash
# Watch docker ps continuously
watch -n 1 'docker ps --format "table {{.Names}}\t{{.Status}}"'

# Output updates every second:
NAMES                  STATUS
devtinder-backend      Up 2 minutes (healthy)
devtinder-frontend     Up 2 minutes
```

---

### Method 5: Check Health Logs

```bash
# View health check logs
docker inspect devtinder-backend \
  --format='{{range .State.Health.Log}}{{.Start}} | Exit: {{.ExitCode}} | Output: {{.Output}}{{println}}{{end}}'

# Output:
2026-04-03T10:30:00Z | Exit: 0 | Output: 
2026-04-03T10:30:30Z | Exit: 0 | Output: 
2026-04-03T10:31:00Z | Exit: 1 | Output: Connection refused
2026-04-03T10:31:30Z | Exit: 0 | Output: 
```

---

### Method 6: Test Health Check Failure

```bash
# Simulate unhealthy app by stopping it
docker exec devtinder-backend pkill node

# Wait 30-90 seconds (depending on retries)
docker ps

# Should show:
STATUS
Up 5 minutes (unhealthy)
```

---

## Alternative Health Check Methods

### Method 1: Using wget (Lightweight)

```dockerfile
# Install wget in Alpine
RUN apk add --no-cache wget

# Health check with wget
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1
```

**wget flags explained:**
```
--quiet         No output
--tries=1       Only try once
--spider        Don't download, just check if exists
|| exit 1       Exit with code 1 if wget fails
```

**Pros:**
- ✅ Lightweight (~2MB)
- ✅ Simple syntax
- ✅ Built for this purpose

**Cons:**
- ⚠️ Adds ~2MB to image size
- ⚠️ Another dependency to maintain

---

### Method 2: Using curl

```dockerfile
# Install curl in Alpine
RUN apk add --no-cache curl

# Health check with curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1
```

**curl flags explained:**
```
-f, --fail      Exit with code 22 on HTTP errors (4xx, 5xx)
|| exit 1       Convert any failure to exit code 1
```

**Pros:**
- ✅ More features than wget
- ✅ Widely used and familiar

**Cons:**
- ⚠️ Larger than wget (~4MB)
- ⚠️ More features than needed for health checks

---

### Method 3: Custom Health Check Script

**File: `backend/healthcheck.js`**

```javascript
#!/usr/bin/env node

const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 5000,
  path: '/health',
  timeout: 2000,
  method: 'GET'
};

console.log(`Running health check on http://${options.host}:${options.port}${options.path}`);

const request = http.get(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        console.log(`Response: ${JSON.stringify(json)}`);
        process.exit(0);  // Healthy
      } catch (e) {
        console.log(`Response: ${data}`);
        process.exit(0);  // Healthy (even if not JSON)
      }
    } else {
      console.error(`Health check failed with status ${res.statusCode}`);
      process.exit(1);  // Unhealthy
    }
  });
});

request.on('error', (err) => {
  console.error(`Health check error: ${err.message}`);
  process.exit(1);  // Unhealthy
});

request.on('timeout', () => {
  console.error('Health check timeout');
  request.destroy();
  process.exit(1);  // Unhealthy
});
```

**Dockerfile:**

```dockerfile
FROM node:22.12.0-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

COPY . .

# Make healthcheck script executable
RUN chmod +x healthcheck.js

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "src/app.js"]
```

**Pros:**
- ✅ No extra dependencies
- ✅ Full control over logic
- ✅ Better error messages
- ✅ Can check multiple endpoints

**Cons:**
- ⚠️ More code to maintain
- ⚠️ Slightly slower than simple one-liner

---

### Method 4: TCP Socket Check (Fastest)

For when you only need to check if port is open:

```dockerfile
# Install netcat in Alpine
RUN apk add --no-cache netcat-openbsd

# Health check - just check if port is listening
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD nc -z localhost 5000 || exit 1
```

**Pros:**
- ✅ Fastest method
- ✅ Minimal overhead
- ✅ No HTTP request needed

**Cons:**
- ❌ Only checks if port is open
- ❌ Doesn't verify app is actually working
- ❌ Can pass even if app is hung/broken

**Use case:** When HTTP health check is too slow or resource-intensive

---

### Method 5: Comprehensive Health Check

Check multiple services:

```javascript
// healthcheck-advanced.js
const http = require('http');
const net = require('net');

// Check HTTP endpoint
function checkHTTP() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:5000/health', (res) => {
      if (res.statusCode === 200) {
        resolve('HTTP OK');
      } else {
        reject(`HTTP failed: ${res.statusCode}`);
      }
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject('HTTP timeout');
    });
  });
}

// Check database port (example: MongoDB on 27017)
function checkDBPort() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve('DB port open');
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject('DB port timeout');
    });
    socket.on('error', (err) => {
      reject(`DB port error: ${err.message}`);
    });
    socket.connect(27017, 'localhost');
  });
}

// Run all checks
async function runHealthCheck() {
  try {
    await checkHTTP();
    console.log('✅ HTTP health check passed');
    
    // Uncomment if you want to check DB too
    // await checkDBPort();
    // console.log('✅ DB port check passed');
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Health check failed: ${error}`);
    process.exit(1);
  }
}

runHealthCheck();
```

---

## Common Issues & Solutions

### Issue 1: Health Check Always Fails

**Symptoms:**
```bash
docker ps
# STATUS: Up 5 minutes (unhealthy)
```

**Diagnosis:**

```bash
# Test health endpoint manually
docker exec devtinder-backend curl http://localhost:5000/health

# Common errors:
# 1. curl: (7) Failed to connect to localhost port 5000
# 2. curl: (52) Empty reply from server
# 3. {"status":"unhealthy","database":"disconnected"}
```

**Cause 1: App not listening on 0.0.0.0**

```javascript
// ❌ WRONG
app.listen(5000, '127.0.0.1');  // Only localhost
app.listen(5000, 'localhost');   // Only localhost

// ✅ CORRECT
app.listen(5000, '0.0.0.0');    // All interfaces
app.listen(5000);                // Defaults to 0.0.0.0
```

**Cause 2: Wrong port**

```dockerfile
# Dockerfile says port 5000
EXPOSE 5000

# But app listens on different port
app.listen(3000);  // ❌ Mismatch!
```

**Cause 3: Health endpoint doesn't exist**

```bash
# Check if /health route exists
docker exec devtinder-backend grep -r "/health" src/
```

**Cause 4: Start period too short**

```dockerfile
# App takes 60 seconds to start
# But start-period is only 30 seconds
HEALTHCHECK --start-period=30s ...  # ❌ Too short

# Fix: Increase start-period
HEALTHCHECK --start-period=90s ...  # ✅ Longer than startup time
```

---

### Issue 2: Health Check Times Out

**Symptoms:**
```bash
docker inspect devtinder-backend | grep -A 5 Health
# "ExitCode": 137  (timeout/killed)
```

**Cause 1: Timeout too short**

```dockerfile
# Health endpoint takes 5 seconds
# But timeout is 3 seconds
HEALTHCHECK --timeout=3s ...  # ❌ Times out

# Fix: Increase timeout
HEALTHCHECK --timeout=10s ...  # ✅ Allows enough time
```

**Cause 2: Slow health endpoint**

```javascript
// ❌ BAD - Slow operations in health check
app.get('/health', async (req, res) => {
  const users = await User.find({});  // Query all users (slow!)
  const posts = await Post.find({});  // Query all posts (slow!)
  res.json({ status: 'ok', users: users.length, posts: posts.length });
});

// ✅ GOOD - Fast health check
app.get('/health', async (req, res) => {
  // Just check connection, don't query data
  const isConnected = mongoose.connection.readyState === 1;
  res.status(isConnected ? 200 : 503).json({ 
    status: isConnected ? 'healthy' : 'unhealthy' 
  });
});
```

---

### Issue 3: Can't Access from Host

**Symptoms:**
```bash
# From your computer
curl http://localhost:5000/health
# curl: (7) Failed to connect to localhost port 5000
```

**Cause: Port not mapped**

```bash
# Check if port is mapped
docker ps

# PORTS column shows:
# (nothing)  ❌ Port not mapped

# Should show:
# 0.0.0.0:5000->5000/tcp  ✅ Port mapped
```

**Fix: Map port in docker-compose.yml**

```yaml
services:
  backend:
    # ... other config
    ports:
      - "5000:5000"  # ✅ Add this
```

---

### Issue 4: Health Check Passes But App is Broken

**Symptoms:**
- Health check: ✅ healthy
- Actual app: ❌ not working

**Cause: Health endpoint too simple**

```javascript
// ❌ BAD - Always returns 200 even if app is broken
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ✅ GOOD - Actually checks critical dependencies
app.get('/health', async (req, res) => {
  const checks = {
    database: false,
    redis: false
  };
  
  // Check database
  try {
    await mongoose.connection.db.admin().ping();
    checks.database = true;
  } catch (e) {
    console.error('DB health check failed:', e);
  }
  
  // Check Redis (if using)
  try {
    await redisClient.ping();
    checks.redis = true;
  } catch (e) {
    console.error('Redis health check failed:', e);
  }
  
  // All checks must pass
  const isHealthy = checks.database && checks.redis;
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks
  });
});
```

---

### Issue 5: Intermittent Health Check Failures

**Symptoms:**
```
Check 1: Pass ✅
Check 2: Fail ❌
Check 3: Pass ✅
Check 4: Fail ❌
```

**Cause 1: Network congestion**

```dockerfile
# Increase retries to tolerate temporary failures
HEALTHCHECK --retries=5 ...  # Was 3, now 5
```

**Cause 2: Database connection pool exhausted**

```javascript
// Increase MongoDB connection pool
mongoose.connect(mongoURI, {
  maxPoolSize: 50,  // Increase from default 10
  minPoolSize: 10
});
```

**Cause 3: Health check competing for resources**

```dockerfile
# Reduce health check frequency
HEALTHCHECK --interval=60s ...  # Was 30s, now 60s
```

---

## Production Best Practices

### 1. Optimize Dockerfile for Production

```dockerfile
# Production-ready Dockerfile
FROM node:22.12.0-alpine

# Set environment to production
ENV NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start app
CMD ["node", "src/app.js"]
```

**Why non-root user?**
- ✅ Security best practice
- ✅ Limits damage if container is compromised
- ✅ Follows principle of least privilege

---

### 2. Multi-Stage Build (Advanced)

For even smaller images:

```dockerfile
# Stage 1: Build
FROM node:22.12.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Optional: Build step if you have TypeScript, etc.
# RUN npm run build

# Stage 2: Production
FROM node:22.12.0-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# Copy built app from builder stage
COPY --from=builder /app/src ./src
# COPY --from=builder /app/dist ./dist  # If you have build output

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/app.js"]
```

**Benefits:**
- ✅ Smaller final image (no dev dependencies)
- ✅ Build dependencies not in production image
- ✅ Better security

---

### 3. Health Check Best Practices

```javascript
// Comprehensive production health check
app.get('/health', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date(),
    status: 'healthy'
  };
  
  try {
    // Check database
    if (mongoose.connection.readyState !== 1) {
      checks.status = 'unhealthy';
      checks.database = 'disconnected';
      return res.status(503).json(checks);
    }
    
    // Quick DB ping (with timeout)
    const pingPromise = mongoose.connection.db.admin().ping();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DB ping timeout')), 2000)
    );
    
    await Promise.race([pingPromise, timeoutPromise]);
    checks.database = 'connected';
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
    };
    
    // Warn if memory usage too high
    if (memUsage.heapUsed > memUsage.heapTotal * 0.9) {
      checks.memoryWarning = 'High memory usage';
    }
    
    res.status(200).json(checks);
    
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Separate readiness check (for Kubernetes)
app.get('/ready', async (req, res) => {
  // Check if app is ready to serve traffic
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

// Separate liveness check (for Kubernetes)
app.get('/live', (req, res) => {
  // Simple check if app is alive
  res.status(200).json({ alive: true });
});
```

---

### 4. Logging Health Checks

```javascript
// Log health check results
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // ... health checks
    
    const duration = Date.now() - startTime;
    console.log(`Health check passed in ${duration}ms`);
    
    res.status(200).json({ status: 'healthy' });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Health check failed in ${duration}ms:`, error);
    
    res.status(503).json({ status: 'unhealthy' });
  }
});
```

---

### 5. Graceful Shutdown

Handle signals properly for clean shutdowns:

```javascript
// src/app.js
const express = require('express');
const mongoose = require('mongoose');
const app = express();

// ... your routes

const server = app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`${signal} received, closing server gracefully`);
  
  server.close(() => {
    console.log('HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
```

---

## Quick Reference

### Common Health Check Patterns

```dockerfile
# 1. Simple HTTP check (Node.js built-in)
HEALTHCHECK CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 2. Using wget
HEALTHCHECK CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

# 3. Using curl
HEALTHCHECK CMD curl -f http://localhost:5000/health || exit 1

# 4. TCP port check
HEALTHCHECK CMD nc -z localhost 5000 || exit 1

# 5. Custom script
HEALTHCHECK CMD node healthcheck.js
```

---

### Health Check Options Cheat Sheet

```dockerfile
HEALTHCHECK --interval=DURATION    # How often (default: 30s)
            --timeout=DURATION     # Max wait time (default: 30s)
            --start-period=DURATION # Grace period (default: 0s)
            --retries=N            # Failures before unhealthy (default: 3)
  CMD command

# Duration format: 10s, 1m, 1h30m
# Examples:
--interval=30s   # Check every 30 seconds
--interval=1m    # Check every 1 minute
--timeout=5s     # Wait max 5 seconds
--start-period=1m30s  # 1 minute 30 seconds grace period
```

---

### Docker Commands for Health Checks

```bash
# Check health status
docker ps
docker inspect CONTAINER | grep -A 10 Health

# View health check logs
docker inspect CONTAINER --format='{{range .State.Health.Log}}{{.Output}}{{end}}'

# Manual health check test
docker exec CONTAINER curl http://localhost:5000/health

# Force unhealthy state (for testing)
docker exec CONTAINER pkill node

# Watch health status
watch -n 1 'docker ps --format "table {{.Names}}\t{{.Status}}"'
```

---

### HTTP Status Codes

```
200 OK                  → Healthy ✅
201 Created             → Healthy ✅
204 No Content          → Healthy ✅

400 Bad Request         → Unhealthy ❌
401 Unauthorized        → Unhealthy ❌
403 Forbidden           → Unhealthy ❌
404 Not Found           → Unhealthy ❌
500 Internal Server Error → Unhealthy ❌
503 Service Unavailable → Unhealthy ❌
```

---

### Exit Codes

```
0   → Success (healthy) ✅
1   → Failure (unhealthy) ❌
2+  → Error (unhealthy) ❌
```

---

### Troubleshooting Checklist

```
□ Is /health endpoint implemented?
□ Does endpoint return status 200?
□ Is app listening on 0.0.0.0 (not 127.0.0.1)?
□ Is port correct (matches EXPOSE)?
□ Is start-period long enough for app startup?
□ Is timeout sufficient for health check response?
□ Are retries set appropriately?
□ Is health check too slow (heavy DB queries)?
□ Check logs: docker logs CONTAINER
□ Check health logs: docker inspect CONTAINER
```

---

## Summary

### Key Takeaways

1. **Localhost in Docker:**
   - Each container has its own localhost
   - Health check runs inside container
   - Uses container's localhost, not host's localhost

2. **Dockerfile Layers:**
   - Copy package files first for caching
   - Install dependencies before source code
   - Each instruction creates a layer

3. **Health Checks:**
   - Document app state beyond just "running"
   - Use appropriate start-period for startup time
   - Keep health endpoint fast and simple
   - Return 200 for healthy, 503 for unhealthy

4. **Production Best Practices:**
   - Use non-root user
   - Install only production dependencies
   - Implement graceful shutdown
   - Use multi-stage builds for smaller images
   - Monitor health check performance

5. **Testing:**
   - Test health endpoint manually first
   - Verify from inside container
   - Check Docker health status
   - Monitor logs for issues

---

**Created:** April 3, 2026  
**Author:** Docker Health Check Guide  
**Version:** 1.0

---

**Need more help?**
- Check Docker documentation: https://docs.docker.com
- Health check reference: https://docs.docker.com/engine/reference/builder/#healthcheck
- Express.js best practices: https://expressjs.com/en/advanced/best-practice-performance.html
