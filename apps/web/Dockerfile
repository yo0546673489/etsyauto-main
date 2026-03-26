FROM node:20-alpine

WORKDIR /app

# Accept build arguments
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG API_INTERNAL_URL

# Set as environment variables for build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
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

# Expose port
EXPOSE 3000

# Start standalone server
CMD ["node", ".next/standalone/server.js"]
