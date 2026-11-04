const STOP = new Set('为什么 怎么 如何 什么 哪些 哪个 吗 呢 的 了 是 与 和 及 有 在 对 本课程 课程 介绍 说明'.split(' '));
const ALIASES = [
  [/总学时|课时|课程时长/, '学时'],
  [/成绩|评分|考试|平时分|作业分|怎么考|如何考|如何考试/, '考核考试'],
  [/实验|实践|实验项目|实践项目/, '实验实践项目'],
  [/参考书|教学参考书|推荐参考书|书目/, '教材参考书'],
  [/中华|家国|科技报国/, '航天文化'],
  [/航天|思政|育人|价值观|精神|图像叙事/, '航天思政航天文化图像叙事自主创新协作育人'],
  [/存储|cache|缓存|主存|高速存储/, '存储系统cache缓存容量扩展高速存储'],
];
const SHORT_FOLLOWUP = /^(?:那|那么)(?:实践课|理论课|没命中|未命中|Cache|缓存|它|这个|上述|该)[^？?。！!]{0,8}(?:呢)?[？?。！!]*$|^(?:这个|上述|它|该)(?:内容|问题|原因)?(?:呢)?[？?。！!]*$|^(?:继续|还有呢|为什么呢|怎么理解|然后呢|举个例子|举例|再说说|详细说说|能展开吗|有何区别|区别呢)[？?。！!]*$/iu;
const GENERIC = /^(你好|谢谢|再见|早上好|晚上好|在吗|你是谁|你能做什么)[？?。！!]*$/u;
const OFF_TOPIC = /天气|气温|下雨|足球|篮球|NBA|英超|世界杯|股票|股价|API\s*密钥|密钥|api\s*key|密码|token|写论文|新闻|电影|外卖|旅游/i;
function tokens(text) {
  const normalized = String(text).toLowerCase().replace(/[‐‑‒–—]/g, '-');
  const out = new Set();
  for (const match of normalized.matchAll(/[a-z][a-z0-9+._-]*/g)) {
    if (match[0].length > 1) out.add(match[0]);
  }
  for (const run of normalized.matchAll(/[\u3400-\u9fff]+/g)) {
    const value = run[0];
    if (value.length === 1) out.add(value);
    else {
      for (let i = 0; i < value.length - 1; i++) out.add(value.slice(i, i + 2));
      // Whole domain concepts remain searchable even when a short character token is filtered.
      for (const term of ['教学大纲', '课程目标', '学时分配', '存储系统', '课程思政', '图像叙事', '学分', '理论课', '实践课', '期末考试', '评分标准', '考核方式', '自主创新']) {
        if (value.includes(term)) out.add(term);
      }
    }
  }
  const expanded = normalized;
  for (const [pattern, addition] of ALIASES) if (pattern.test(expanded)) {
    for (const item of tokensRaw(addition)) out.add(item);
  }
  for (const stop of STOP) out.delete(stop);
  return out;
}

function tokensRaw(text) {
  const out = [];
  for (const match of text.matchAll(/[a-z][a-z0-9+._-]*|[\u3400-\u9fff]+/gi)) {
    const value = match[0].toLowerCase();
    if (value.length === 1) out.push(value);
    else if (/^[\u3400-\u9fff]+$/u.test(value)) {
      for (let i = 0; i < value.length - 1; i++) out.push(value.slice(i, i + 2));
    } else out.push(value);
  }
  return out;
}

function getHistoryQuestions(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-6).map(item => typeof item === 'string' ? item : item?.question ?? '')
    .filter(value => typeof value === 'string' && value.trim()).slice(-1);
}

export function contextualQuestion(question, history = []) {
  const query = question.trim();
  const prior = SHORT_FOLLOWUP.test(query) ? getHistoryQuestions(history) : [];
  return prior.length ? `${prior.join(' ')} ${query}` : query;
}

export function isOutOfScopeQuestion(question) {
  return GENERIC.test(question.trim()) || OFF_TOPIC.test(question);
}

export function createRetriever(chunks) {
  const docs = (Array.isArray(chunks) ? chunks : []).filter(d => d && typeof d.text === 'string' && typeof d.id === 'string');
  const docTokens = docs.map(d => tokenCounts(`${d.title || ''} ${d.section || ''} ${d.text}`));
  const avgLength = docTokens.reduce((sum, t) => sum + t.size, 0) / Math.max(1, docs.length);
  const df = new Map();
  for (const terms of docTokens) for (const term of terms.keys()) df.set(term, (df.get(term) || 0) + 1);

  function search(question, { history = [], limit = 6 } = {}) {
    if (typeof question !== 'string' || !question.trim() || GENERIC.test(question.trim()) || OFF_TOPIC.test(question)) return [];
    const query = contextualQuestion(question, history);
    const terms = tokens(query);
    if (!terms.size) return [];
    const topicTerms = topicTokens(terms, df);
    if (!topicTerms.length) return [];
    const syllabusIntent = /学分|学时|课时|成绩|考核|评分|考试/.test(query);
    const maxResults = Math.max(1, Math.min(6, Math.floor(Number(limit) || 6)));
    const scored = [];
    for (let i = 0; i < docs.length; i++) {
      const words = docTokens[i];
      const bodyTerms = tokenCounts(docs[i].text);
      const topicMatches = topicTerms.filter(term => bodyTerms.has(term));
      if (!topicMatches.length) continue;
      let score = 0;
      for (const term of terms) {
        if (!words.has(term)) continue;
        const idf = Math.log(1 + (docs.length - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
        const tf = words.get(term);
        const length = Math.max(1, words.size);
        score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / Math.max(1, avgLength)));
      }
      if (topicTerms.length > 1 && topicMatches.length / topicTerms.length < 0.15) continue;
      if (syllabusIntent && docs[i].sourceId === 'syllabus-2024') score *= 1.35;
      if (syllabusIntent && /成绩|考核|评分|考试|期末|平时/.test(query) && docs[i].sourceId === 'syllabus-2024' && /总成绩|成绩评定办法|考核形式及成绩占比/.test(docs[i].text)) score += 24;
      if (/存储/.test(query) && /学时|课时/.test(query) && docs[i].sourceId === 'syllabus-2024' && /推荐学时|课内\d+学时/.test(docs[i].text)) score += 18;
      if (/实验|实践/.test(query) && /哪些|项目|几个|多少个|列出/.test(query) && /^syllabus-2024-t03-r00[2-6]$/.test(docs[i].id)) score += 100;
      if (score >= 0.8) scored.push({ ...docs[i], score });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return scored.slice(0, maxResults).map(({ id, title, section, locator, text, sourceId, sourceFile, score, teachingTopic, teachingPoint }) => ({
      id, title, section, locator, text: text.slice(0, 1500), sourceId, sourceFile, score,
      ...(teachingTopic ? { teachingTopic, teachingPoint } : {}),
    }));
  }
  return { search };
}

export function tokenFrequencies(text) {
  const counts = new Map();
  const add = token => { if (!STOP.has(token)) counts.set(token, (counts.get(token) || 0) + 1); };
  for (const token of tokensRaw(text)) add(token);
  const normalized = String(text).toLowerCase();
  for (const term of ['教学大纲', '课程目标', '学时分配', '存储系统', '课程思政', '图像叙事', '学分', '理论课', '实践课', '期末考试', '评分标准', '考核方式', '自主创新']) {
    for (const _match of normalized.matchAll(new RegExp(term, 'g'))) add(term);
  }
  for (const [pattern, addition] of ALIASES) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    for (const match of normalized.matchAll(new RegExp(pattern.source, flags))) {
      for (const token of tokensRaw(addition)) if (token !== match[0].toLowerCase()) add(token);
    }
  }
  return counts;
}

const tokenCounts = tokenFrequencies;

function topicTokens(queryTerms, corpusFrequency) {
  // Derive supported vocabulary from the retained documents. This lets natural
  // headings such as "实验项目" and "参考书" work without a topic allowlist.
  return [...queryTerms].filter(term => corpusFrequency.has(term) && !STOP.has(term));
}
