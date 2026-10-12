# Production image for the Next.js frontend (standalone output).
FROM node:22-alpine AS build
WORKDIR /app

# `npm install`, not `npm ci`: the lockfile is generated on Windows and
# misses Linux-only optional deps — same reason as .github/workflows/ci.yml.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
# Inlined into the client bundle at build time, so it is a build arg, not a
# runtime env var. The API is served from the same origin under /api/
# (deploy/Caddyfile), which the httpOnly auth cookies rely on.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
