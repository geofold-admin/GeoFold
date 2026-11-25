# Node 24 LTS (Node 20 reached end of life on 30 Apr 2026 and gets no security fixes).
FROM node:24-alpine
# Also switches off the dev-token bypass in src/auth.js, which only works outside production.
ENV NODE_ENV=production
WORKDIR /app

# Exact versions from the lockfile, production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Code and node_modules stay owned by root, so the app cannot rewrite itself. (In production src/
# is bind-mounted read-only over this copy; see docker-compose.yml.)
COPY . .

# The only place the app writes (plus /tmp). In production the host's storage directory is mounted
# here, owned by uid 1000 — the deploy user on the host, `node` in this image; deploy.sh keeps it
# that way. Creating it here lets the image also start without that mount (deploy boot test).
RUN mkdir -p /app/storage/pictures && chown -R node:node /app/storage

EXPOSE 3000
USER node
# node directly rather than `npm start`: npm as PID 1 does not pass SIGTERM on, so every
# `docker compose up` waited out the 10 s stop timeout and then killed the process.
CMD ["node", "src/index.js"]
