const { Client } = require('ssh2');

const config = {
  host: '120.27.115.74',
  port: 22,
  username: 'root',
  password: '@123321abcD',
  tryKeyboard: true,
  keepaliveInterval: 10000,
  keepaliveCountMax: 100
};

const PROJECT_DIR = '/root/test_review';
const PORT = 80;

function run(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    const show = label || cmd;
    console.log(`\n>>> ${show}`);
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('close', (code) => {
        if (output.trim()) console.log(output.trim());
        console.log(`[exit ${code}]`);
        resolve({ code, output });
      });
      stream.on('data', d => { output += d.toString(); });
      stream.stderr.on('data', d => { output += d.toString(); });
    });
  });
}

async function deploy() {
  const conn = new Client();

  console.log('========================================');
  console.log('  刷题工具 - 服务器部署脚本');
  console.log('========================================');

  console.log('\n[1/7] 正在连接服务器...');
  await new Promise((resolve, reject) => {
    conn.on('ready', () => {
      console.log('SSH 连接成功!');
      resolve();
    });
    conn.on('error', reject);
    conn.connect(config);
  });

  // Step 1: Check Node.js
  console.log('\n[2/7] 检查 Node.js 环境...');
  let r = await run(conn, 'node -v && npm -v', '检查 Node 和 npm 版本');

  console.log('\n[3/7] 配置国内 npm 镜像...');
  await run(conn, 'npm config set registry https://registry.npmmirror.com', '设置 npmmirror 镜像源');

  console.log('\n[4/7] 拉取/更新项目代码...');
  r = await run(conn, `test -d ${PROJECT_DIR}/.git && echo "exists" || echo "fresh"`, '检查项目目录');
  if (r.output.includes('exists')) {
    await run(conn, `cd ${PROJECT_DIR} && git fetch origin && git reset --hard origin/main`, '拉取最新代码');
  } else {
    await run(conn, `rm -rf ${PROJECT_DIR}`, '清理旧目录');
    await run(conn, `git clone https://github.com/Y-Q-Y-SJ/test_review.git ${PROJECT_DIR}`, '克隆仓库');
  }

  console.log('\n[5/7] 安装项目依赖...');
  await run(conn, `cd ${PROJECT_DIR} && rm -rf node_modules && npm install --production`, 'npm install (使用国内镜像)');

  console.log('\n[6/7] 配置进程管理...');
  r = await run(conn, 'command -v pm2 >/dev/null 2>&1 && echo "yes" || echo "no"', '检查 pm2');
  if (r.output.includes('no')) {
    await run(conn, 'npm install -g pm2', '全局安装 pm2');
  }

  await run(conn, `lsof -ti:${PORT} | xargs -r kill -9 2>/dev/null; echo 'ok'`, '清理端口');
  await run(conn, `cd ${PROJECT_DIR} && pm2 stop quiz-tool 2>/dev/null; pm2 delete quiz-tool 2>/dev/null; PORT=${PORT} pm2 start server/index.js --name quiz-tool`, '启动/重启服务');
  await run(conn, 'pm2 save', '保存 pm2 进程列表');
  await run(conn, 'pm2 startup systemd -u root --hp /root 2>/dev/null || true', '设置开机自启');

  console.log('\n[7/7] 验证部署结果...');
  await run(conn, 'pm2 list', '查看进程状态');
  await run(conn, `sleep 2 && curl -s -o /dev/null -w "HTTP状态码: %{http_code}\\n" http://localhost:${PORT}/`, '验证服务响应');
  await run(conn, `curl -s -X POST http://localhost:${PORT}/api/login -H "Content-Type: application/json" -d '{"code":"deploy-test"}'`, '测试登录接口');

  conn.end();

  console.log('\n========================================');
  console.log('  部署完成!');
  console.log(`  访问地址: http://${config.host}:${PORT}`);
  console.log('========================================');
  process.exit(0);
}

deploy().catch(err => {
  console.error('\n部署失败:', err.message);
  process.exit(1);
});
