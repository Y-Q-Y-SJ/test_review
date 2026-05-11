#!/bin/bash
# 服务健康监控脚本
# 每分钟检查 quiz-tool 和 vocab-card，异常自动重启

LOG="/var/log/service-monitor.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

check_service() {
  local name=$1
  local port=$2
  local status

  # 检查 pm2 进程是否在线
  status=$(pm2 jlist 2>/dev/null | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try{
        const list=JSON.parse(d);
        const app=list.find(a=>a.name==='$name');
        console.log(app ? app.pm2_env.status : 'not_found');
      }catch(e){console.log('error');}
    });
  " 2>/dev/null)

  if [ "$status" != "online" ]; then
    echo "[${TIMESTAMP}] ${name}: 进程状态=${status}, 正在重启..." >> ${LOG}
    pm2 restart ${name} 2>/dev/null
    echo "[${TIMESTAMP}] ${name}: 已重启" >> ${LOG}
    return
  fi

  # 检查端口是否可访问
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:${port}/ 2>/dev/null)
  if [ "$http_code" != "200" ]; then
    echo "[${TIMESTAMP}] ${name}: HTTP=${http_code}, 正在重启..." >> ${LOG}
    pm2 restart ${name}
    echo "[${TIMESTAMP}] ${name}: 已重启" >> ${LOG}
  fi
}

check_service "quiz-tool" 80
check_service "vocab-card" 3000

# 日志文件超过 1000 行时截断
lines=$(wc -l < ${LOG} 2>/dev/null || echo 0)
if [ "$lines" -gt 1000 ]; then
  tail -500 ${LOG} > ${LOG}.tmp && mv ${LOG}.tmp ${LOG}
fi
