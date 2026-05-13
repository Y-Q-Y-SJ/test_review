const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localFile = path.resolve(__dirname, '..', 'data', 'questions.json');
const remoteDir = '/root/test_review/data/questions.json';
const sshConfig = { host: '120.27.115.74', port: 22, username: 'root', password: '@123321abcD', tryKeyboard: true };

/**
 * Sync questions.json to remote server and restart the service.
 * @returns {Promise<{ success: boolean, questionCount: number, message: string }>}
 */
function syncToRemote() {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      const questions = JSON.parse(fs.readFileSync(localFile, 'utf-8'));
      console.log(`本地题库: ${questions.length} 题`);

      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          reject(new Error(`SFTP error: ${err.message}`));
          return;
        }

        const ws = sftp.createWriteStream(remoteDir);
        ws.on('close', () => {
          console.log('questions.json 已上传');
          conn.exec('pm2 restart quiz-tool', { pty: true }, (err, stream) => {
            if (err) {
              conn.end();
              reject(new Error(`exec error: ${err.message}`));
              return;
            }

            stream.on('close', () => {
              conn.end();
              resolve({
                success: true,
                questionCount: questions.length,
                message: '同步完成，服务已重启'
              });
            });
          });
        });

        ws.on('error', (err) => {
          conn.end();
          reject(new Error(`Upload error: ${err.message}`));
        });

        ws.write(JSON.stringify(questions, null, 2));
        ws.end();
      });
    });

    conn.on('error', (e) => {
      reject(new Error(`SSH error: ${e.message}`));
    });

    conn.connect(sshConfig);
  });
}

// CLI usage
if (require.main === module) {
  syncToRemote()
    .then(result => {
      console.log(result.message);
      process.exit(0);
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { syncToRemote };
