const { Client } = require('ssh2');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); reject(err); return; }
        stream.on('data', d => output += d.toString());
        stream.stderr.on('data', d => output += d.toString());
        stream.on('close', () => { conn.end(); resolve(output); });
      });
    }).on('error', reject).connect(SSH);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'ls') {
    const dir = args[1] || '/opt/profitly/apps/web';
    console.log(await sshExec(`find "${dir}" -name "*.tsx" -o -name "*.ts" | grep -v node_modules | grep -v ".next" | head -60`));
  } else if (args[0] === 'cat') {
    console.log(await sshExec(`cat "${args[1]}"`));
  } else if (args[0] === 'write') {
    // Write file: args[1] = path, stdin has content
    const fs = require('fs');
    const content = fs.readFileSync(args[2], 'utf8');
    const escaped = content.replace(/'/g, "'\\''");
    await sshExec(`cat > "${args[1]}" << 'HEREDOC_EOF'\n${content}\nHEREDOC_EOF`);
    console.log('Written');
  } else if (args[0] === 'exec') {
    console.log(await sshExec(args.slice(1).join(' ')));
  }
}

main().catch(e => console.error(e.message));
