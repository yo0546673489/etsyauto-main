const { Client } = require('ssh2');
const fs = require('fs');

const SSH = { host: '185.241.4.225', port: 22, username: 'root', password: 'aA@05466734890', readyTimeout: 20000 };

const remotePath = process.argv[2];
const localPath = process.argv[3];
const content = fs.readFileSync(localPath, 'utf8');

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP err:', err.message); conn.end(); return; }
    const writeStream = sftp.createWriteStream(remotePath);
    writeStream.write(content, 'utf8', (err2) => {
      if (err2) console.error('Write err:', err2.message);
      else console.log('Written:', remotePath);
      writeStream.end();
      conn.end();
    });
  });
}).on('error', e => console.error('SSH:', e.message)).connect(SSH);
