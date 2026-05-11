# 刷题工具

从在线培训平台导出的 HTML 考试记录中自动提取题目，构建支持多端同步的刷题系统。

支持单选题、多选题、判断题、填空题四种题型，移动端优先设计，手机/PAD/电脑均可使用。

## 目录

- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [扩充题库](#扩充题库)
- [功能说明](#功能说明)
- [多端同步与用户隔离](#多端同步与用户隔离)
- [部署指南](#部署指南)
- [API 接口](#api-接口)
- [解析原理](#解析原理)
- [技术栈](#技术栈)
- [常见问题](#常见问题)

## 项目结构

```
├── package.json                # 项目配置与 npm 脚本
├── README.md                   # 本文档
│
├── server/                     # 后端服务
│   └── index.js                #   Express 应用（API 路由 + 静态文件托管）
│
├── public/                     # 前端页面
│   └── index.html              #   刷题界面（移动端优先，纯 HTML/CSS/JS）
│
├── scripts/                    # 工具脚本
│   ├── parse.js                #   全量解析：读取 data/source/*.html → 生成 data/questions.json
│   └── import.js               #   增量导入：解析新 HTML → 自动去重 → 合并到 questions.json
│
├── data/                       # 数据目录
│   ├── questions.json          #   题库（由 parse.js 或 import.js 生成）
│   ├── source/                 #   原始 HTML 文件（从平台下载后放到这里）
│   │   ├── 考试详情 - 积极分子在线培训.html
│   │   ├── 考试详情 - 积极分子在线培训2.html
│   │   └── ...
│   └── users/                  #   用户错题数据（服务启动后自动创建）
│       ├── <hash>.json         #   文件名 = 暗号的 SHA256 前24位
│       └── ...
│
└── node_modules/               # 依赖包（npm install 生成）
```

## 环境要求

- **Node.js** v14 或更高版本（[下载](https://nodejs.org/)）
- **npm**（随 Node.js 自带）

验证安装：

```bash
node -v   # 应输出 v14.x.x 或更高
npm -v    # 应输出 6.x.x 或更高
```

## 快速开始

### 第一步：安装依赖

```bash
npm install
```

### 第二步：放入源文件

将从平台导出的 HTML 文件放入 `data/source/` 目录。文件名格式如：

```
data/source/
├── 考试详情 - 积极分子在线培训.html
├── 考试详情 - 积极分子在线培训2.html
├── 考试详情 - 积极分子在线培训3.html
└── ...
```

### 第三步：解析题库

```bash
npm run parse
```

输出示例：

```
找到 12 个源文件
  考试详情 - 积极分子在线培训.html: 100 题
  考试详情 - 积极分子在线培训2.html: 100 题
  ...

解析完成: 共 1200 题, 去重 344 题
最终题库: 856 题
  单选题: 496
  多选题: 159
  判断题: 102
  填空题: 99

已写入 data/questions.json
```

### 第四步：启动服务

```bash
npm start
```

输出：

```
刷题服务已启动: http://localhost:3000
题库: 856 题
局域网访问: http://本机IP:3000
```

### 第五步：开始刷题

- **本机**：浏览器打开 `http://localhost:3000`
- **手机/PAD**：浏览器打开 `http://电脑局域网IP:3000`

输入暗号即可进入。首次使用输入新暗号自动创建，无需注册。

## 扩充题库

平台出了新考试时，下载 HTML 文件，有两种导入方式：

### 方式一：全量重建

将新文件放入 `data/source/`，然后重新解析所有源文件：

```bash
cp 新考试.html data/source/
npm run parse
```

适合：源文件有较大变动，或第一次搭建题库。

### 方式二：增量导入（推荐）

指定单个或多个文件，自动去重后追加到现有题库：

```bash
npm run import -- "新考试.html"
# 多个文件
npm run import -- "考试13.html" "考试14.html"
```

输出示例：

```
现有题库: 856 题

  考试13.html: 解析 100 题, 新增 23 题, 重复跳过 77 题
  考试14.html: 解析 100 题, 新增 18 题, 重复跳过 82 题

========================================
本次导入: 解析 200 题, 新增 41 题, 重复跳过 159 题
更新后题库: 897 题

已写入 data/questions.json
重启服务后生效 (npm start)
```

**去重规则**：按题干文本精确匹配。如果新题的题干与已有题目完全一致，则跳过。

导入完成后重启服务生效：

```bash
# 停止当前服务 (Ctrl+C)，然后
npm start
```

## 功能说明

### 三种刷题模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 顺序练习 | 按题库顺序依次作答 | 系统学习、首次刷题 |
| 随机练习 | 打乱顺序随机出题 | 模拟考试、查漏补缺 |
| 错题回顾 | 只练习之前答错的题目 | 针对性复习 |

### 四种题型

| 题型 | 标识 | 操作方式 |
|------|------|----------|
| 单选题 | 蓝色标签 | 点击选项，立即判定对错 |
| 多选题 | 橙色标签 | 勾选多个选项后，点击「确认答案」 |
| 判断题 | 绿色标签 | 点击选项，立即判定对错 |
| 填空题 | 紫色标签 | 在输入框填写答案后，点击「确认」 |

### 答案反馈

答题后即时显示结果，**无弹窗**，不影响刷题节奏：

- **答对**：选项高亮绿色，显示「回答正确！」
- **答错**：错误选项标红，正确选项标绿，显示正确答案文字

答错的题目自动加入错题库，实时同步到服务端。

### 错题库

- 答错即记录，实时同步到服务端 `data/users/` 目录
- 多设备输入相同暗号，错题库自动一致
- 服务重启不丢失（持久化在 JSON 文件中）
- 首页显示错题数量，点击「错题回顾」专项练习
- 「清空错题库」需 3 秒内二次点击确认，防止误操作

## 多端同步与用户隔离

### 同步原理

```
手机 ──┐
       ├──→  http://服务器IP:3000  ──→  data/users/<暗号哈希>.json
PAD  ──┤
       │
电脑 ──┘
```

- 所有设备连接同一个服务地址
- 输入相同暗号 → 读写同一个文件 → 数据一致
- 输入不同暗号 → 读写不同文件 → 完全隔离

### 隔离机制

暗号经过 SHA256 哈希后取前 24 位作为文件名：

```
暗号 "study2026"  →  SHA256  →  data/users/a1b2c3d4e5f6a1b2c3d4e5f6.json
暗号 "review"     →  SHA256  →  data/users/f6e5d4c3b2a1f6e5d4c3b2a1.json
```

- 文件名不可逆推暗号
- 不同暗号 = 不同文件 = 完全隔离
- 无需注册，暗号即身份

## 部署指南

### 本机 / 局域网（开发/个人使用）

```bash
# 默认端口 3000
npm start

# 指定端口
PORT=8080 npm start
```

确保防火墙放行对应端口，手机/PAD 即可通过局域网 IP 访问。

查看本机 IP：

```bash
# Windows
ipconfig | findstr IPv4

# macOS / Linux
ifconfig | grep "inet "
```

### 服务器部署（推荐 pm2）

```bash
# 1. 上传项目到服务器
scp -r ./quiz-tool user@server:/home/user/

# 2. SSH 登录服务器
ssh user@server

# 3. 进入项目目录，安装依赖
cd /home/user/quiz-tool
npm install --production

# 4. 安装 pm2（进程守护）
npm install -g pm2

# 5. 启动服务
pm2 start server/index.js --name quiz

# 6. 设置开机自启
pm2 save
pm2 startup
```

pm2 常用命令：

```bash
pm2 list              # 查看运行状态
pm2 logs quiz         # 查看日志
pm2 restart quiz      # 重启服务
pm2 stop quiz         # 停止服务
```

### 修改端口

通过环境变量设置：

```bash
# 临时
PORT=80 npm start

# pm2 持久化
pm2 start server/index.js --name quiz --env PORT=80
```

## API 接口

需要认证的接口通过 HTTP Header `x-code` 传递暗号。

### POST /api/login

登录，创建/读取用户数据。

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"code": "mycode"}'
```

响应：

```json
{"ok": true, "code": "mycode", "totalQuestions": 856, "wrongCount": 3}
```

### GET /api/questions

获取全部题目列表。

```bash
curl http://localhost:3000/api/questions -H "x-code: mycode"
```

### GET /api/wrong

获取当前用户的错题 ID 列表。

```bash
curl http://localhost:3000/api/wrong -H "x-code: mycode"
```

响应：

```json
{"wrongIds": [1, 5, 12, 38]}
```

### POST /api/wrong

同步错题。支持增量添加和移除：

```bash
curl -X POST http://localhost:3000/api/wrong \
  -H "Content-Type: application/json" \
  -H "x-code: mycode" \
  -d '{"add": [10, 20], "remove": [5]}'
```

响应：

```json
{"ok": true, "wrongCount": 5}
```

### DELETE /api/wrong

清空错题库：

```bash
curl -X DELETE http://localhost:3000/api/wrong -H "x-code: mycode"
```

### GET /api/stats

获取题库和用户统计：

```bash
curl http://localhost:3000/api/stats -H "x-code: mycode"
```

响应：

```json
{
  "totalQuestions": 856,
  "typeCounts": {"单选题": 496, "多选题": 159, "判断题": 102, "填空题": 99},
  "wrongCount": 5
}
```

## 解析原理

### 源 HTML 结构

平台导出的 HTML 文件中，每道题的结构如下：

```html
<!-- 每道题由一个 error_sub 容器包裹 -->
<div class="error_sub">

  <!-- 题干 -->
  <div class="sub_title">
    <h3>1、【单选题】题干文字内容</h3>
  </div>

  <!-- 选项区域：单选/判断题用 exam_result2，多选题用 exam_result_box2 -->
  <div class="exam_result2">
    <ul>
      <!-- 正确选项带有 result_cut class -->
      <li class="result_cut">
        <label class="checked">
          <input type="radio" name="radio3"> A、正确选项文字
        </label>
      </li>
      <!-- 错误选项 -->
      <li>
        <label>
          <input type="radio" name="radio3"> B、错误选项文字
        </label>
      </li>
    </ul>
  </div>

  <!-- 正确答案 -->
  <div class="sub_result">
    <span class="sub_color">正确答案：A</span>
  </div>

</div>
```

### 提取规则

| 题型 | 选项容器 class | 正确选项标记 | 答案提取方式 |
|------|---------------|-------------|-------------|
| 单选题 | `exam_result2` | `<li class="result_cut">` | span 中 `正确答案：C` |
| 多选题 | `exam_result_box2` | `<li class="result_cut">` | span 中 `正确答案：BCD` |
| 判断题 | `exam_result2` | `<li class="result_cut">` | span 中 `正确答案：A` |
| 填空题 | `sub_list` | — | `<div class="sub_cont">文本</div>` |

### 去重规则

按题干文本精确匹配（去除 HTML 标签和 `&nbsp;` 后比较）。同一题干只保留最先出现的题目。

### scripts/parse.js 与 scripts/import.js 的区别

| | parse.js | import.js |
|---|---|---|
| 输入 | `data/source/` 下所有 `考试详情*.html` | 命令行指定的文件路径 |
| 输出 | 覆盖 `data/questions.json` | 合并到现有 `data/questions.json` |
| 去重 | 源文件间去重 | 与现有题库去重 |
| 适用场景 | 首次搭建、全量重建 | 增量添加新考试 |

两个脚本共享 `parseHtmlFile()`、`deduplicate()` 等函数（定义在 `scripts/parse.js` 中，`import.js` 通过 `require` 引用）。

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 后端 | Node.js + Express 4 | 提供 API 和静态文件服务 |
| 前端 | 原生 HTML / CSS / JavaScript | 无框架依赖，移动端优先 |
| 数据存储 | JSON 文件 | 题库 + 按暗号隔离的用户错题 |
| 认证 | SHA256 哈希暗号 | 通过 HTTP Header 传递，无需注册 |

## 常见问题

**Q: 手机/PAD 无法访问？**

1. 确认手机和电脑在同一局域网（连接同一个 WiFi）
2. 确认电脑防火墙放行了服务端口（默认 3000）
3. 确认访问地址是 `http://电脑IP:3000`，不是 `https`

Windows 放行防火墙（管理员 PowerShell）：

```powershell
netsh advfirewall firewall add rule name="Quiz" dir=in action=allow protocol=TCP localport=3000
```

**Q: 服务重启后错题库还在吗？**

在。错题数据保存在服务端 `data/users/` 目录的 JSON 文件中，与服务进程无关。

**Q: 新增题目后已有错题会丢失吗？**

不会。错题库按题目 ID 存储。全量重建 (`npm run parse`) 会重新编号，可能导致旧的错题 ID 指向不同题目。建议使用增量导入 (`npm run import`)，新增题的 ID 只会往后排，不影响已有记录。

**Q: 多个人可以用同一个暗号吗？**

可以，但不建议。同暗号 = 同错题库，多人混用会导致错题记录互相影响。建议每人用不同的暗号。

**Q: 如何修改服务端口？**

通过环境变量 `PORT` 设置：

```bash
PORT=8080 npm start
```

**Q: 如何备份/迁移数据？**

整个 `data/` 目录就是全部数据，拷贝即可：

```bash
# 备份
cp -r data/ backup/

# 迁移到新机器：拷贝整个项目目录即可
```
