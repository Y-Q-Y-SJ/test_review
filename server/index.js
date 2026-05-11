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
  if (!fs.existsSync(file)) return { wrongIds: [], fillWrongIds: [], starIds: [], seqIndex: 0, fillIndex: 0 };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data.fillWrongIds) data.fillWrongIds = [];
    if (!data.starIds) data.starIds = [];
    if (data.fillIndex === undefined) data.fillIndex = 0;
    return data;
  }
  catch { return { wrongIds: [], fillWrongIds: [], starIds: [], seqIndex: 0, fillIndex: 0 }; }
}

function writeUserData(code, data) {
  fs.writeFileSync(getUserFile(code), JSON.stringify(data), 'utf-8');
}

function getCode(req) {
  try { return decodeURIComponent(req.headers['x-code'] || ''); } catch { return req.headers['x-code'] || ''; }
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
  const data = readUserData(code);
  data.wrongIds = [];
  writeUserData(code, data);
  res.json({ ok: true, wrongCount: 0 });
});

app.get('/api/progress', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  res.json({ seqIndex: data.seqIndex || 0 });
});

app.post('/api/progress', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const { seqIndex } = req.body;
  const data = readUserData(code);
  data.seqIndex = seqIndex;
  writeUserData(code, data);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
  const data = readUserData(code);
  const typeCounts = {};
  questions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
  res.json({
    totalQuestions: questions.length, typeCounts,
    wrongCount: data.wrongIds.length,
    starCount: (data.starIds || []).length,
    fillWrongCount: (data.fillWrongIds || []).length
  });
});

// ===== Star APIs =====
app.get('/api/star', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  res.json({ starIds: data.starIds || [] });
});

app.post('/api/star', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const { add = [], remove = [] } = req.body;
  const data = readUserData(code);
  if (!data.starIds) data.starIds = [];
  const set = new Set(data.starIds);
  for (const id of add) set.add(id);
  for (const id of remove) set.delete(id);
  data.starIds = [...set];
  writeUserData(code, data);
  res.json({ ok: true, starCount: data.starIds.length });
});

// ===== Fill Wrong APIs =====
app.get('/api/fill-wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  res.json({ fillWrongIds: data.fillWrongIds || [] });
});

app.post('/api/fill-wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const { add = [], remove = [] } = req.body;
  const data = readUserData(code);
  if (!data.fillWrongIds) data.fillWrongIds = [];
  const set = new Set(data.fillWrongIds);
  for (const id of add) set.add(id);
  for (const id of remove) set.delete(id);
  data.fillWrongIds = [...set];
  writeUserData(code, data);
  res.json({ ok: true, fillWrongCount: data.fillWrongIds.length });
});

app.delete('/api/fill-wrong', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  data.fillWrongIds = [];
  writeUserData(code, data);
  res.json({ ok: true, fillWrongCount: 0 });
});

// ===== Fill Progress APIs =====
app.get('/api/fill-progress', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const data = readUserData(code);
  res.json({ fillIndex: data.fillIndex || 0 });
});

app.post('/api/fill-progress', (req, res) => {
  const code = getCode(req);
  if (!code) return res.status(401).json({ error: '未登录' });
  const { fillIndex } = req.body;
  const data = readUserData(code);
  data.fillIndex = fillIndex;
  writeUserData(code, data);
  res.json({ ok: true });
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
