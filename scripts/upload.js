const fs = require('fs');
const path = require('path');
const { parseHtmlFile, assignIds } = require('./parse');

const ROOT = path.join(__dirname, '..');
const QUESTIONS_FILE = path.join(ROOT, 'data', 'questions.json');

/**
 * Import HTML files into the question bank.
 * @param {string[]} filePaths - Absolute paths to HTML files
 * @returns {{ added: number, skipped: number, total: number, questionCount: number, details: object[] }}
 */
function importHtmlFiles(filePaths) {
  // Load existing questions
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  } catch {} // start fresh if file missing or corrupt
  const existingStems = new Set(existing.map(q => q.stem));

  let newTotal = 0;
  let newAdded = 0;
  let newSkipped = 0;
  const details = [];

  for (const file of filePaths) {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      details.push({ file: path.basename(file), error: '文件不存在' });
      continue;
    }

    const questions = parseHtmlFile(fullPath);
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

    newTotal += questions.length;
    newAdded += added;
    newSkipped += skipped;

    details.push({
      file: path.basename(file),
      parsed: questions.length,
      added,
      skipped
    });
  }

  // Re-assign sequential IDs
  assignIds(existing);

  // Write back
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(existing, null, 2), 'utf-8');

  return {
    questions: existing,
    added: newAdded,
    skipped: newSkipped,
    total: newTotal,
    questionCount: existing.length,
    details
  };
}

module.exports = { importHtmlFiles };
