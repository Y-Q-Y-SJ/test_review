const fs = require('fs');
const path = require('path');
const { parseHtmlFile, deduplicate, assignIds, printStats } = require('./parse');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

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

// Load existing questions
let existing = [];
if (fs.existsSync(QUESTIONS_FILE)) {
  existing = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
}
const existingStems = new Set(existing.map(q => q.stem));
console.log(`现有题库: ${existing.length} 题\n`);

let newTotal = 0;
let newAdded = 0;
let newDupSkipped = 0;

for (const file of inputFiles) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.log(`  跳过: ${file} (文件不存在)`);
    continue;
  }

  const questions = parseHtmlFile(fullPath);
  newTotal += questions.length;

  let added = 0;
  let skipped = 0;
  for (const q of questions) {
    if (existingStems.has(q.stem)) {
      skipped++;
    } else {
      existingStems.add(q.stem);
      existing.push(q);
      added++;
    }
  }

  const name = path.basename(file);
  console.log(`  ${name}: 解析 ${questions.length} 题, 新增 ${added} 题, 重复跳过 ${skipped} 题`);
  newAdded += added;
  newDupSkipped += skipped;
}

// Re-assign sequential IDs
assignIds(existing);

// Write back
fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(existing, null, 2), 'utf-8');

console.log(`\n${'='.repeat(40)}`);
console.log(`本次导入: 解析 ${newTotal} 题, 新增 ${newAdded} 题, 重复跳过 ${newDupSkipped} 题`);
printStats('更新后题库', existing);
console.log(`\n已写入 ${QUESTIONS_FILE}`);
console.log('重启服务后生效 (npm start)');
