const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const OUTPUT_FILE = path.join(ROOT, 'data', 'questions.json');

/**
 * Parse a single HTML file and return an array of question objects.
 */
function parseHtmlFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const questions = [];
  const blocks = html.split(/<div class="error_sub">/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/<h3>(\d+)、【(单选题|多选题|判断题|填空题)】\s*([\s\S]*?)<\/h3>/);
    if (!titleMatch) continue;

    const type = titleMatch[2];
    const stem = titleMatch[3].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();

    if (type === '填空题') {
      const answerDiv = block.match(/<div class="sub_list1">[\s\S]*?<div class="sub_cont">([\s\S]*?)<\/div>/);
      const correctAnswer = answerDiv ? answerDiv[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
      questions.push({ type, stem, options: [], correctAnswer });
      continue;
    }

    const optionClass = (type === '单选题' || type === '判断题') ? 'exam_result2' : 'exam_result_box2';
    const optionBlock = block.match(new RegExp(`<div class="${optionClass}">([\\s\\S]*?)</div>`));
    if (!optionBlock) continue;

    const options = [];
    const liRegex = /<li(?:\s+class="result_cut")?>\s*<label(?:\s+class="checked")?>\s*<input[^>]*>\s*([\s\S]*?)<\/label>\s*<\/li>/g;
    let liMatch;
    while ((liMatch = liRegex.exec(optionBlock[1])) !== null) {
      options.push({
        text: liMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim(),
        correct: liMatch[0].includes('result_cut')
      });
    }

    const answerMatch = block.match(/正确答案：([A-Z对错]+)/);
    const correctAnswer = answerMatch ? answerMatch[1].trim() : '';

    questions.push({
      type,
      stem,
      options: options.map((opt, idx) => ({
        letter: String.fromCharCode(65 + idx),
        text: opt.text,
        correct: opt.correct
      })),
      correctAnswer
    });
  }

  return questions;
}

/**
 * Deduplicate questions by stem. Returns { unique, total, duplicates }.
 */
function deduplicate(questions) {
  const seen = new Set();
  const unique = [];
  let dupCount = 0;
  for (const q of questions) {
    if (seen.has(q.stem)) { dupCount++; continue; }
    seen.add(q.stem);
    unique.push(q);
  }
  return { unique, total: questions.length, duplicates: dupCount };
}

/**
 * Assign sequential IDs starting from startId.
 */
function assignIds(questions, startId = 1) {
  questions.forEach((q, i) => { q.id = startId + i; });
  return questions;
}

/**
 * Print stats for a set of questions.
 */
function printStats(label, questions) {
  const types = {};
  questions.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
  console.log(`${label}: ${questions.length} 题`);
  for (const [type, count] of Object.entries(types)) {
    console.log(`  ${type}: ${count}`);
  }
}

// ===== Main =====
if (require.main === module) {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`源文件目录不存在: ${SOURCE_DIR}`);
    console.error('请将 HTML 文件放入 data/source/ 目录');
    process.exit(1);
  }

  const htmlFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.html') && f.startsWith('考试详情'));
  if (!htmlFiles.length) {
    console.error('data/source/ 下未找到 HTML 文件');
    process.exit(1);
  }

  console.log(`找到 ${htmlFiles.length} 个源文件`);
  let all = [];
  for (const f of htmlFiles) {
    const qs = parseHtmlFile(path.join(SOURCE_DIR, f));
    console.log(`  ${f}: ${qs.length} 题`);
    all = all.concat(qs);
  }

  const { unique, total, duplicates } = deduplicate(all);
  assignIds(unique);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`\n解析完成: 共 ${total} 题, 去重 ${duplicates} 题`);
  printStats('最终题库', unique);
  console.log(`\n已写入 ${OUTPUT_FILE}`);
}

module.exports = { parseHtmlFile, deduplicate, assignIds, printStats };
