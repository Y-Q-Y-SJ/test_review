const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { importHtmlFiles } = require('../scripts/upload');
let syncToRemote = null;
function getSyncToRemote() {
  if (!syncToRemote) syncToRemote = require('../scripts/sync_data').syncToRemote;
  return syncToRemote;
}

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const SOURCE_DIR = path.join(DATA_DIR, 'source');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Multer config: save uploaded HTML files to data/source/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SOURCE_DIR),
  filename: (req, file, cb) => {
    // Decode original filename (handle Chinese characters)
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 HTML 文件'), false);
    }
  }
});

if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
if (!fs.existsSync(SOURCE_DIR)) fs.mkdirSync(SOURCE_DIR, { recursive: true });

app.use(express.json());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
  }
}));

// Cache questions at startup (reloadable after import)
let questions;
try {
  questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
} catch {
  questions = [];
  console.error(`无法读取题库文件: ${QUESTIONS_FILE}，已使用空题库`);
}

// ===== Exam Papers =====
let examPapers = [];
function buildExamPapers() {
  const { parseHtmlFile } = require('../scripts/parse');
  try {
    const srcDir = path.join(ROOT, 'data', 'source');
    if (!fs.existsSync(srcDir)) return [];
    const files = fs.readdirSync(srcDir)
      .filter(f => f.endsWith('.html') && !f.includes('_files'))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] || '0');
        const nb = parseInt(b.match(/(\d+)/)?.[1] || '0');
        return na - nb;
      });

    const stemToId = {};
    questions.forEach(q => { stemToId[q.stem] = q.id; });

    const papers = [];
    let idx = 0;
    for (const file of files) {
      const filePath = path.join(srcDir, file);
      try {
        const parsed = parseHtmlFile(filePath);
        const qIds = [];
        const types = {};
        for (const q of parsed) {
          const id = stemToId[q.stem];
          if (id != null) { qIds.push(id); types[q.type] = (types[q.type] || 0) + 1; }
        }
        if (qIds.length > 0) {
          idx++;
          papers.push({ name: `mock-${idx}`, displayName: `模拟卷 ${idx}`, questions: qIds, types });
        }
      } catch (e) {
        console.error(`解析失败: ${file}`, e.message);
      }
    }

    if (papers.length > 0) {
      papers.push({ name: 'random', displayName: '随机组卷', questions: [], types: { ...papers[0].types } });
    }
    return papers;
  } catch (e) {
    console.error('构建模拟卷失败:', e.message);
    return [];
  }
}
examPapers = buildExamPapers();

// ===== Helpers =====
function codeToHash(code) {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
}

function getUserFile(code) {
  return path.join(USERS_DIR, `${codeToHash(code)}.json`);
}

const DEFAULT_USER_DATA = { wrongIds: [], fillWrongIds: [], starIds: [], seqIndex: 0, fillIndex: 0, attemptCounts: {} };

function readUserData(code) {
  try {
    const data = JSON.parse(fs.readFileSync(getUserFile(code), 'utf-8'));
    if (!data.fillWrongIds) data.fillWrongIds = [];
    if (!data.starIds) data.starIds = [];
    if (data.fillIndex === undefined) data.fillIndex = 0;
    if (!data.attemptCounts) data.attemptCounts = {};
    return data;
  }
  catch { return { ...DEFAULT_USER_DATA }; }
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

app.get('/api/exam-papers', requireAuth, (req, res) => {
  res.json({ papers: examPapers });
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
  const data = readUserData(req.userCode);
  res.json({ attemptCounts: data.attemptCounts || {} });
});

app.post('/api/attempts', requireAuth, (req, res) => {
  const { questionId, questionIds } = req.body;
  const ids = questionIds || (questionId ? [questionId] : []);
  if (!ids.length) return res.status(400).json({ error: 'missing questionId' });
  const data = readUserData(req.userCode);
  if (!data.attemptCounts) data.attemptCounts = {};
  for (const id of ids) {
    data.attemptCounts[id] = (data.attemptCounts[id] || 0) + 1;
  }
  writeUserData(req.userCode, data);
  res.json({ ok: true });
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

// ===== Import & Sync =====

app.post('/api/import', requireAuth, upload.array('files'), (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: '请上传 HTML 文件' });
  }

  const filePaths = req.files.map(f => f.path);
  try {
    const result = importHtmlFiles(filePaths);
    questions = result.questions;

    res.json({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      total: result.total,
      questionCount: result.questionCount,
      details: result.details
    });
  } catch (err) {
    // Clean up uploaded files on error
    for (const f of filePaths) {
      try { fs.unlinkSync(f); } catch {}
    }
    res.status(500).json({ error: `导入失败: ${err.message}` });
  }
});

let syncInProgress = false;
app.post('/api/sync', requireAuth, async (req, res) => {
  if (syncInProgress) return res.status(409).json({ error: '同步正在进行中，请稍后' });
  syncInProgress = true;
  try {
    const result = await getSyncToRemote()();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    syncInProgress = false;
  }
});

// Multer error handler — return JSON instead of HTML
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小不能超过 10MB' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: '一次最多上传 20 个文件' });
  }
  if (err.message === '只支持 HTML 文件') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || '上传失败' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`刷题服务已启动: http://localhost:${PORT}`);
  console.log(`题库: ${questions.length} 题`);
});
