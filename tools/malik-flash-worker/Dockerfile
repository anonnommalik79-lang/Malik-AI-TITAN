FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm test && install -d -m 0700 -o node -g node /home/node/flash-test-profiles
ENV NODE_ENV=production MALIK_FLASH_CHROME_PATH=/usr/bin/chromium MALIK_FLASH_PROFILE_DIR=/home/node/flash-test-profiles
USER node
CMD ["node", "staging-start.mjs"]
