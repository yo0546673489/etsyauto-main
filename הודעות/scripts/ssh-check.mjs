import { Client } from 'ssh2';

const HOST = '185.241.4.225';
const USER = 'root';
const PASS = 'aA@05466734890';

const COMMANDS = [
  // Check the הודעות docker-compose
  'cat /opt/profitly/*/docker-compose.yml 2>/dev/null | head -80',
  // Check if there is a separate docker-compose in הודעות
  'find /opt/profitly -name "docker-compose.yml" | xargs ls -la 2>/dev/null',
  // Check the הודעות package.json for scripts
  'find /opt/profitly -name "package.json" -not -path "*/node_modules/*" | head -5 | xargs cat 2>/dev/null',
  // Check what port 3500 situation is on Linux
  'ss -tlnp | grep 3500 || echo "nothing on 3500"',
  // Check NEXT_PUBLIC_API_URL situation - what does the web container use
  'docker exec etsy-web env | grep -E "NEXT_PUBLIC|API_URL|MESSAGES" 2>/dev/null || echo "cant exec"',
];

function runCommands(client, cmds) {
  return new Promise((resolve, reject) => {
    let results = [];
    let i = 0;
    function next() {
      if (i >= cmds.length) return resolve(results);
      const cmd = cmds[i++];
      client.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => {
          results.push({ cmd, out });
          next();
        });
      });
    }
    next();
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ SSH connected');
  try {
    const results = await runCommands(conn, COMMANDS);
    for (const { cmd, out } of results) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`$ ${cmd}`);
      console.log(out.trim());
    }
  } catch(e) {
    console.error('Error:', e);
  }
  conn.end();
}).connect({ host: HOST, port: 22, username: USER, password: PASS });

conn.on('error', err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
