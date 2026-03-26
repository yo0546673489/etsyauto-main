FROM node:20-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Used at build time by next.config.js rewrites (must match Docker service name on etsy-network)
ENV API_INTERNAL_URL=http://api:8080
COPY package.json ./
RUN npm install --prefer-offline --no-audit --maxsockets=3
COPY . .
RUN npm run build
EXPOSE 3002
CMD ["npm", "start"]
