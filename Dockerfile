FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS deps
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM deps AS migrate
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src/server/auth/password.ts ./src/server/auth/password.ts
COPY --chown=node:node src/server/db/schema.ts ./src/server/db/schema.ts
COPY --chown=node:node src/contracts ./src/contracts
COPY --chown=node:node src/components/prototype ./src/components/prototype
COPY --chown=node:node documents/sources ./documents/sources
USER node
CMD ["npm", "run", "db:migrate"]
FROM migrate AS document-import
USER root
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && node -e "process.stdout.write(require('node:tls').rootCertificates.join('\n') + '\n')" > /tmp/debian-ca.pem \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-ca.pem update \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-ca.pem install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-rus \
    && rm /tmp/debian-ca.pem \
    && rm -rf /var/lib/apt/lists/*
USER node
ENTRYPOINT ["npm", "run", "documents", "--"]
CMD []
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS qwen-bridge
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && node -e "process.stdout.write(require('node:tls').rootCertificates.join('\n') + '\n')" > /tmp/debian-ca.pem \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-ca.pem update \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-ca.pem install -y --no-install-recommends openssh-client \
    && rm -rf /tmp/debian-ca.pem /var/lib/apt/lists/* \
    && install -d -o node -g node -m 0700 /run/qwen \
    && touch /run/qwen/.volume
COPY infra/qwen/ /opt/qwen/
USER node
CMD ["node", "/opt/qwen/bridge.mjs"]

FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/assets/pdf ./assets/pdf
USER node
EXPOSE 3000
CMD ["node", "server.js"]
