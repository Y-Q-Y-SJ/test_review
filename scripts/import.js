const path = require('path');
const { importHtmlFiles } = require('./upload');
const { printStats } = require('./parse');

// CLI arguments: paths to HTML files to import
const inputFiles = process.argv.slice(2);

if (!inputFiles.length) {
  console.log('用法: node scripts/import.js <html文件1> [html文件2] ...');
  console.log('');
  console.log('示例:');
  console.log('  node scripts/import.js "考试详情 - 积极分子在线培训13.html"');
  console.log('  node scripts/import.js *.html');
  console.log('');
  console.log('将新 HTML 文件的题目合并到 data/questions.json，自动去重');
  process.exit(0);
}

console.log(`准备导入 ${inputFiles.length} 个文件...\n`);

const result = importHtmlFiles(inputFiles);

// Print details
for (const d of result.details) {
  if (d.error) {
    console.log(`  跳过: ${d.file} (${d.error})`);
  } else {
    console.log(`  ${d.file}: 解析 ${d.parsed} 题, 新增 ${d.added} 题, 重复跳过 ${d.skipped} 题`);
  }
}

console.log(`\n${'='.repeat(40)}`);
console.log(`本次导入: 解析 ${result.total} 题, 新增 ${result.added} 题, 重复跳过 ${result.skipped} 题`);
printStats('更新后题库', result.questions);
console.log(`\n已写入 data/questions.json`);
console.log('重启服务后生效 (npm start)');
