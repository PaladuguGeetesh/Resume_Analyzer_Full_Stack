FROM node:26-alpine

# puppeteer (used for resume PDF generation) downloads a glibc-linked Chrome by
# default, which doesn't run on alpine's musl libc — install Chromium from
# alpine's own repo instead and point puppeteer at it, skipping its download.
RUN apk add --no-cache chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# copy only manifest files first so `npm ci` is cached across builds unless
# dependencies actually change
COPY package.json package-lock.json ./
# --legacy-peer-deps: ioredis-mock's peer dep (ioredis ^5) conflicts with the
# real ioredis ^6 this project uses — same flag needed here as in local installs
RUN npm ci --omit=dev --legacy-peer-deps

COPY . .

EXPOSE 3000

# default process is the API — docker-compose overrides this command for the
# worker service to run the same image as a separate process instead
CMD ["node", "server.js"]
