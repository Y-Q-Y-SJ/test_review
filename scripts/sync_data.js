const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const conn = new Client();

const localFile = path.resolve(__dirname, '..', 'data', 'questions.json');
const remoteDir = '/root/test_review/data/questions.json';
const sshConfig = { host: '120.27.115.74', port: 22, username: 'root', password: '@123321abcD', tryKeyboard: true };

conn.on('ready', () => {
  console.log('SSH connected');
  const questions = JSON.parse(fs.readFileSync(localFile, 'utf-8'));
  console.log(`本地题库: ${questions.length} 题`);

  conn.sftp((err, sftp) => {
    if (err) { console.error(err); conn.end(); return; }
    const ws = sftp.createWriteStream(remoteDir);
    ws.on('close', () => {
      console.log('questions.json 已上传');
      conn.exec('pm2 restart quiz-tool', {pty:true}, (err, stream) => {
        if (err) { console.error(err); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', () => {
          console.log('\n同步完成，服务已重启');
          conn.end();
          process.exit(0);
        });
      });
    });
    ws.write(JSON.stringify(questions, null, 2));
    ws.end();
  });
});
conn.on('error', e => { console.error(e); process.exit(1); });
conn.connect(sshConfig);
