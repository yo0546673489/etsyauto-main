FROM node:20-alpine

WORKDIR /app

# Accept build arguments
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG API_INTERNAL_URL
ARG NEXT_PUBLIC_WINDOWS_SERVER_WS
ARG NEXT_PUBLIC_INTERNAL_KEY

# Set as environment variables for build
# NOTE: NEXT_PUBLIC_MESSAGES_API_URL is intentionally set to a placeholder at build time.
# It is replaced at container startup by docker-entrypoint.sh using the runtime env var.
# This avoids Docker layer cache issues where the URL gets baked in as empty string.
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_PUBLIC_WINDOWS_SERVER_WS=${NEXT_PUBLIC_WINDOWS_SERVER_WS}
ENV NEXT_PUBLIC_INTERNAL_KEY=${NEXT_PUBLIC_INTERNAL_KEY}
ENV NEXT_PUBLIC_MESSAGES_API_URL=__NEXT_PUBLIC_MESSAGES_API_URL__
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
COPY package.json ./
RUN npm install --prefer-offline --no-audit --maxsockets=3

# Copy application code
COPY . .

# Build application
RUN npm run build

# Copy standalone output and static files
RUN cp -r .next/static .next/standalone/.next/static
RUN cp -r public .next/standalone/public 2>/dev/null || true

# Copy entrypoint script
RUN cp docker-entrypoint.sh .next/standalone/docker-entrypoint.sh && \
    chmod +x .next/standalone/docker-entrypoint.sh

EXPOSE 3000

# Use entrypoint to inject runtime env vars before starting
CMD ["sh", "/app/.next/standalone/docker-entrypoint.sh"]
