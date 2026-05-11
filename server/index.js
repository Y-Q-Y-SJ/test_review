const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Ensure directories exist
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

// ===== Helpers =====
function codeToHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
}

function getUserFile(code) {
  return path.join(USERS_DIR, `${codeToHash(code)}.json`);
}

function readUserData(code) {
  const file = getUserFile(code);
  if (!fs.existsSync(file)) return { wrongIds: [] };
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return { wrongIds: [] }; }
}

function writeUserData(code, data) {
  fs.writeFileSync(getUserFile(code), JSON.stringify(data), 'utf-8');
}

function getCode(req) {
  return req.headers['x-code'] || '';
}

// ===== API Routes =====

app.post('/api/login', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string' || code.trim().length < 2) {
    return res.status(400).json({ error: '暗号至少2个字符' });
  }
  const trimmed = code.trim();
  const data = readUserData(trimmed);
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  res.json({
    ok: true,
    code: trimmed,
    totalQuestions: questions.length,
    wrongCount: data.wrongIds.length
  });
});

app.get('/api/questions', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  res.json(questions);
});

app.get('/api/wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  res.json({ wrongIds: data.wrongIds });
});

app.post('/api/wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const { add = [], remove = [] } = req.body;
  const data = readUserData(code);
  const set = new Set(data.wrongIds);
  for (const id of add) set.add(id);
  for (const id of remove) set.delete(id);
  data.wrongIds = [...set];
  writeUserData(code, data);
  res.json({ ok: true, wrongCount: data.wrongIds.length });
});

app.delete('/api/wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  writeUserData(code, { wrongIds: [] });
  res.json({ ok: true, wrongCount: 0 });
});

app.get('/api/stats', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  const data = readUserData(code);
  const typeCounts = {};
  questions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
  res.json({ totalQuestions: questions.length, typeCounts, wrongCount: data.wrongIds.length });
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  console.log(`刷题服务已启动: http://localhost:${PORT}`);
  console.log(`题库: ${questions.length} 题`);
  console.log(`局域网访问: http://本机IP:${PORT}`);
});
