/**
 * Setup script: connects Linux server, starts messages API, links website to it
 *
 * Architecture:
 *   Windows (scraping) → Linux DB (postgres:5433) → Linux messages server (port 3500) → Website
 */

import { Client } from 'ssh2';

const HOST = '185.241.4.225';
const USER = 'root';
const PASS = 'aA@05466734890';

// Check if there's a Dockerfile in הודעות
const DOCKERFILE_CONTENT = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install
COPY . .
RUN npm run build 2>/dev/null || true
EXPOSE 3500
CMD ["node", "dist/index.js"]
`;

const COMMANDS = [
  // 1. Check if Dockerfile exists in הודעות
  'ls /opt/profitly/הודעות/Dockerfile 2>/dev/null && echo EXISTS || echo MISSING',
  // 2. Check what DBs exist on Linux postgres
  'docker exec etsy-db psql -U postgres -l 2>/dev/null | grep -E "etsy|Name"',
  // 3. Check the הודעות .env if exists
  'cat /opt/profitly/הודעות/.env 2>/dev/null || echo "NO .env"',
  // 4. Check docker-compose for current services
  'grep "container_name:" /opt/profitly/docker-compose.yml',
  // 5. Check if messages service already defined
  'grep -A5 "messages\\|3500" /opt/profitly/docker-compose.yml || echo "no messages service"',
];

function runCmd(client, cmd) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

async function writeFile(client, path, content) {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(path);
      stream.on('close', resolve);
      stream.on('error', reject);
      stream.write(content);
      stream.end();
    });
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ SSH connected');
  try {
    // Step 1: Check current state
    console.log('\n📋 Checking current state...');
    for (const cmd of COMMANDS) {
      console.log(`\n$ ${cmd}`);
      const out = await runCmd(conn, cmd);
      console.log(out);
    }

    // Step 2: Create etsy_messages DB if missing
    console.log('\n📦 Creating etsy_messages database...');
    const createDb = await runCmd(conn,
      'docker exec etsy-db psql -U postgres -c "CREATE DATABASE etsy_messages OWNER postgres;" 2>&1 || echo "already exists"'
    );
    console.log(createDb);

    // Step 3: Create .env for messages server on Linux
    console.log('\n📝 Writing .env for messages server...');
    const messagesEnv = `DATABASE_URL=postgresql://postgres:postgres_dev_password@db:5432/etsy_messages
REDIS_URL=redis://redis:6379
API_PORT=3500
API_HOST=0.0.0.0
FRONTEND_URL=https://yaroncohen.cc
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=a05832261551@gmail.com
IMAP_PASSWORD=
ADSPOWER_API_URL=http://91.202.169.242:50325
ANTHROPIC_API_KEY=
`;
    await writeFile(conn, '/opt/profitly/הודעות/.env', messagesEnv);
    console.log('✅ .env written');

    // Step 4: Write Dockerfile for messages server
    console.log('\n🐳 Writing Dockerfile...');
    const hasDockerfile = await runCmd(conn, 'ls /opt/profitly/הודעות/Dockerfile 2>/dev/null && echo YES || echo NO');
    if (hasDockerfile.includes('NO')) {
      await writeFile(conn, '/opt/profitly/הודעות/Dockerfile', DOCKERFILE_CONTENT);
      console.log('✅ Dockerfile written');
    } else {
      console.log('✅ Dockerfile already exists');
    }

    // Step 5: Add messages service to docker-compose.yml if not there
    console.log('\n🔧 Checking docker-compose for messages service...');
    const hasMessages = await runCmd(conn, 'grep -c "etsy-messages" /opt/profitly/docker-compose.yml || echo 0');

    if (hasMessages.trim() === '0') {
      console.log('  Adding messages service to docker-compose.yml...');
      const addService = `
# Append messages service
cat >> /opt/profitly/docker-compose.yml << 'DOCKEREOF'

  messages:
    build:
      context: ./הודעות
      dockerfile: Dockerfile
    container_name: etsy-messages
    restart: unless-stopped
    ports:
      - "3500:3500"
    env_file:
      - ./הודעות/.env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - etsy-network
DOCKEREOF`;
      const result = await runCmd(conn, addService);
      console.log('  Result:', result || 'OK');
    } else {
      console.log('  Messages service already in docker-compose.yml');
    }

    // Step 6: Update main .env with NEXT_PUBLIC_MESSAGES_API_URL
    console.log('\n🌐 Setting NEXT_PUBLIC_MESSAGES_API_URL in main .env...');
    const updateEnv = await runCmd(conn,
      `grep -q "NEXT_PUBLIC_MESSAGES_API_URL" /opt/profitly/.env && \
       sed -i 's|NEXT_PUBLIC_MESSAGES_API_URL=.*|NEXT_PUBLIC_MESSAGES_API_URL=http://185.241.4.225:3500|' /opt/profitly/.env || \
       echo "NEXT_PUBLIC_MESSAGES_API_URL=http://185.241.4.225:3500" >> /opt/profitly/.env`
    );
    console.log('  Done');

    // Also fix NEXT_PUBLIC_API_URL
    console.log('  Fixing NEXT_PUBLIC_API_URL...');
    await runCmd(conn,
      `sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://yaroncohen.cc|' /opt/profitly/.env`
    );
    console.log('  Done');

    // Step 7: Build and start messages container
    console.log('\n🚀 Building and starting messages server...');
    const build = await runCmd(conn,
      'cd /opt/profitly && docker compose -p etsyauto build messages 2>&1 | tail -10'
    );
    console.log(build);

    const start = await runCmd(conn,
      'cd /opt/profitly && docker compose -p etsyauto up -d messages 2>&1'
    );
    console.log(start);

    // Step 8: Rebuild web with new env vars
    console.log('\n🔄 Rebuilding web container with new env vars...');
    const rebuildWeb = await runCmd(conn,
      'cd /opt/profitly && docker compose -p etsyauto up -d --build web 2>&1 | tail -15'
    );
    console.log(rebuildWeb);

    // Step 9: Check final status
    console.log('\n📊 Final status:');
    const status = await runCmd(conn,
      'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" | grep -E "messages|web|NAMES"'
    );
    console.log(status);

    console.log('\n✅ Setup complete!');
    console.log('Messages API: http://185.241.4.225:3500/api/health');
    console.log('Website: https://yaroncohen.cc/messages');

  } catch(e) {
    console.error('❌ Error:', e);
  }
  conn.end();
}).connect({ host: HOST, port: 22, username: USER, password: PASS });

conn.on('error', err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
