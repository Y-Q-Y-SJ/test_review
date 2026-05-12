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

if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

// Cache questions at startup
const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));

// ===== Helpers =====
function codeToHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
}

function getUserFile(code) {
  return path.join(USERS_DIR, `${codeToHash(code)}.json`);
}

function readUserData(code) {
  const file = getUserFile(code);
  if (!fs.existsSync(file)) return { wrongIds: [], fillWrongIds: [], starIds: [], seqIndex: 0, fillIndex: 0, attemptCounts: {} };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!data.fillWrongIds) data.fillWrongIds = [];
    if (!data.starIds) data.starIds = [];
    if (data.fillIndex === undefined) data.fillIndex = 0;
    if (!data.attemptCounts) data.attemptCounts = {};
    return data;
  }
  catch { return { wrongIds: [], fillWrongIds: [], starIds: [], seqIndex: 0, fillIndex: 0, attemptCounts: {} }; }
}

function writeUserData(code, data) {
  fs.writeFileSync(getUserFile(code), JSON.stringify(data), 'utf-8');
}

function getCode(req) {
  try { return decodeURIComponent(req.headers['x-code'] || ''); } catch { return req.headers['x-code'] || ''; }
}

// ===== Auth middleware =====
function requireAuth(req, res, next) {
  req.userCode = getCode(req);
  if (!req.userCode) return res.status(401).json({ error: '未登录' });
  next();
}

// Generic id-set route factory
function idSetRoutes(getPath, dataKey, countKey) {
  app.get(getPath, requireAuth, (req, res) => {
    const data = readUserData(req.userCode);
    res.json({ [dataKey]: data[dataKey] || [] });
  });
  app.post(getPath, requireAuth, (req, res) => {
    const { add = [], remove = [] } = req.body;
    const data = readUserData(req.userCode);
    if (!data[dataKey]) data[dataKey] = [];
    const set = new Set(data[dataKey]);
    for (const id of add) set.add(id);
    for (const id of remove) set.delete(id);
    data[dataKey] = [...set];
    writeUserData(req.userCode, data);
    res.json({ ok: true, [countKey]: data[dataKey].length });
  });
  app.delete(getPath, requireAuth, (req, res) => {
    const data = readUserData(req.userCode);
    data[dataKey] = [];
    writeUserData(req.userCode, data);
    res.json({ ok: true, [countKey]: 0 });
  });
}

// ===== Routes =====

app.post('/api/login', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string' || code.trim().length < 2) {
    return res.status(400).json({ error: '暗号至少2个字符' });
  }
  const trimmed = code.trim();
  const data = readUserData(trimmed);
  res.json({ ok: true, code: trimmed, totalQuestions: questions.length, wrongCount: data.wrongIds.length });
});

app.get('/api/questions', requireAuth, (req, res) => {
  res.json(questions);
});

idSetRoutes('/api/wrong', 'wrongIds', 'wrongCount');
idSetRoutes('/api/star', 'starIds', 'starCount');
idSetRoutes('/api/fill-wrong', 'fillWrongIds', 'fillWrongCount');

app.get('/api/progress', requireAuth, (req, res) => {
  const data = readUserData(req.userCode);
  res.json({ seqIndex: data.seqIndex || 0 });
});

app.post('/api/progress', requireAuth, (req, res) => {
  const data = readUserData(req.userCode);
  data.seqIndex = req.body.seqIndex;
  writeUserData(req.userCode, data);
  res.json({ ok: true });
});

app.get('/api/fill-progress', requireAuth, (req, res) => {
  const data = readUserData(req.userCode);
  res.json({ fillIndex: data.fillIndex || 0 });
});

app.post('/api/fill-progress', requireAuth, (req, res) => {
  const data = readUserData(req.userCode);
  data.fillIndex = req.body.fillIndex;
  writeUserData(req.userCode, data);
  res.json({ ok: true });
});

app.get('/api/attempts', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const data = readUserData(req.userCode);
  res.json({ attemptCounts: data.attemptCounts || {} });
});

app.post('/api/attempts', requireAuth, (req, res) => {
  const { questionId } = req.body;
  if (!questionId) return res.status(400).json({ error: 'missing questionId' });
  const data = readUserData(req.userCode);
  if (!data.attemptCounts) data.attemptCounts = {};
  data.attemptCounts[questionId] = (data.attemptCounts[questionId] || 0) + 1;
  writeUserData(req.userCode, data);
  res.json({ ok: true, count: data.attemptCounts[questionId] });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const data = readUserData(req.userCode);
  const typeCounts = {};
  questions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
  res.json({
    totalQuestions: questions.length, typeCounts,
    wrongCount: data.wrongIds.length,
    starCount: (data.starIds || []).length,
    fillWrongCount: (data.fillWrongIds || []).length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`刷题服务已启动: http://localhost:${PORT}`);
  console.log(`题库: ${questions.length} 题`);
});
