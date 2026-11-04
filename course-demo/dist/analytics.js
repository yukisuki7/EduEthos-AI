/* Local teacher analytics for explicit demo data. This module never writes sessions. */
(function (root) {
  const CATEGORIES = [
    { id: 'overview', label: '概述' },
    { id: 'data', label: '数据运算' },
    { id: 'memory', label: '存储系统' },
    { id: 'instructions', label: '指令系统' },
    { id: 'cpu', label: '处理器' },
    { id: 'io', label: '输入输出与总线' },
    { id: 'other', label: '其他/待归类' }
  ];
  const TOPIC_CATEGORY = {
    'von-neumann': 'overview', bus: 'io', binary: 'data', 'floating-point': 'data',
    cache: 'memory', 'cache-miss': 'memory', hierarchy: 'memory', 'ram-rom': 'memory',
    isa: 'instructions', execution: 'instructions', pipeline: 'cpu', frequency: 'cpu',
    'interrupt-polling': 'io', dma: 'io'
  };
  const KEYWORDS = [
    { key: '冯诺依曼', aliases: ['冯诺依曼', '冯·诺依曼', '冯诺依曼结构', '存储程序'] },
    { key: '总线', aliases: ['总线', '数据总线', '地址总线', '控制总线'] },
    { key: '二进制', aliases: ['二进制', '二进制数'] },
    { key: '补码', aliases: ['补码', '二进制补码'] },
    { key: '定点数', aliases: ['定点数', '定点表示'] },
    { key: '浮点数', aliases: ['浮点数', '浮点表示', '浮点运算'] },
    { key: '存储层次', aliases: ['存储层次', '内存层次'] },
    { key: 'Cache', aliases: ['cache', '高速缓存', '高速缓冲'] },
    { key: '局部性', aliases: ['局部性', '时间局部性', '空间局部性'] },
    { key: '命中', aliases: ['未命中', '命中率', '命中'] },
    { key: 'RAM', aliases: ['ram', '随机存取存储器'] },
    { key: 'ROM', aliases: ['rom', '只读存储器'] },
    { key: 'ISA', aliases: ['isa', '指令集架构', '指令集'] },
    { key: '取指', aliases: ['取指', '取指令'] },
    { key: '译码', aliases: ['译码', '指令译码'] },
    { key: '流水线', aliases: ['流水线', '指令流水'] },
    { key: '冒险', aliases: ['冒险', '数据冒险', '结构冒险', '控制冒险'] },
    { key: 'CPU', aliases: ['cpu', '处理器', '中央处理器'] },
    { key: '主频', aliases: ['主频', '时钟频率', 'ghz'] },
    { key: '中断', aliases: ['中断', '中断处理'] },
    { key: '轮询', aliases: ['轮询', '程序查询'] },
    { key: 'DMA', aliases: ['dma', '直接存储器访问', '直接内存访问'] },
    { key: '运算器', aliases: ['运算器', '算术逻辑单元', 'alu'] },
    { key: '控制器', aliases: ['控制器', '控制单元'] }
  ];

  function parseNow(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value == null ? Date.now() : value);
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  function parseExplicitISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return null;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return null;
    // Reject normalized impossible calendar dates (for example 2026-02-31).
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
    return time;
  }

  function classify(message) {
    const topic = message && message.answer && typeof message.answer.topic === 'string' ? message.answer.topic : '';
    if (TOPIC_CATEGORY[topic]) return TOPIC_CATEGORY[topic];
    const q = String(message && message.question || '').toLowerCase();
    const matchers = [
      ['memory', /cache|高速缓存|高速缓冲|存储层次|内存层次|主存|外存|ram|rom|局部性|命中|未命中/],
      ['data', /二进制|补码|定点数|浮点数|浮点|进制|溢出/],
      ['instructions', /指令集|isa|微架构|取指|译码|指令执行/],
      ['io', /输入输出|\bi\/o\b|中断|轮询|dma|直接存储器访问|直接内存访问|总线/],
      ['cpu', /流水线|冒险|主频|时钟频率|ghz|处理器|cpu|中央处理器/],
      ['overview', /冯.?诺依曼|存储程序|计算机系统|计算机.{0,6}(组成|结构|层次)|系统结构|概述/]
    ];
    const found = matchers.find(([, regex]) => regex.test(q));
    return found ? found[0] : 'other';
  }

  function isEligible(message) {
    return !!message && message.isDemo !== true && (message.authorRole === 'student' || message.authorRole === undefined);
  }

  function build(sessions, options) {
    options = options || {};
    const range = ['7', '30'].includes(String(options.range)) ? String(options.range) : 'all';
    const now = parseNow(options.now).getTime();
    const cutoff = range === 'all' ? -Infinity : now - Number(range) * 24 * 60 * 60 * 1000;
    const seen = new Set();
    const messages = [];
    let untimedCount = 0;
    let legacyRoleCount = 0;
    const countedSessions = new Set();

    for (const session of Array.isArray(sessions) ? sessions : []) {
      const list = Array.isArray(session && session.messages) ? session.messages : [];
      for (let i = 0; i < list.length; i++) {
        const message = list[i];
        if (!isEligible(message)) continue;
        const id = message.id == null ? null : String(message.id);
        if (id != null && seen.has(id)) continue;
        if (id != null) seen.add(id);
        const timestamp = parseExplicitISO(message.createdAt);
        if (timestamp == null) untimedCount++;
        if (range !== 'all' && timestamp == null) continue;
        if (range !== 'all' && (timestamp < cutoff || timestamp > now)) continue;
        messages.push(message);
        if (message.authorRole === undefined) legacyRoleCount++;
        if (session && session.id != null) countedSessions.add(String(session.id));
      }
    }

    const total = messages.length;
    const counts = Object.fromEntries(CATEGORIES.map(c => [c.id, 0]));
    const questionCounts = new Map();
    const keywordCounts = new Map(KEYWORDS.map(k => [k.key, 0]));
    let unresolvedCount = 0;
    for (const message of messages) {
      const category = classify(message);
      counts[category]++;
      if (message.answer && message.answer.supported === false) unresolvedCount++;
      const question = String(message.question || '').trim();
      if (question) {
        const normalized = `${question.toLocaleLowerCase()}\u0000${category}`;
        const entry = questionCounts.get(normalized) || { question, count: 0, category: category };
        entry.count++;
        questionCounts.set(normalized, entry);
      }
      const lower = question.toLowerCase();
      for (const keyword of KEYWORDS) {
        if (keyword.aliases.some(alias => lower.includes(alias.toLowerCase()))) keywordCounts.set(keyword.key, keywordCounts.get(keyword.key) + 1);
      }
    }

    const categories = CATEGORIES.map(c => ({ id: c.id, label: c.label, count: counts[c.id], percent: total ? Math.round(counts[c.id] * 1000 / total) / 10 : 0 }));
    const rankedKeywords = Array.from(keywordCounts, ([text, count]) => ({ text, count })).filter(k => k.count > 0).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'zh-CN')).slice(0, 20);
    const maxKeyword = rankedKeywords.length ? rankedKeywords[0].count : 0;
    const minKeyword = rankedKeywords.length ? rankedKeywords[rankedKeywords.length - 1].count : 0;
    // Stretch the observed frequency range: equal counts keep equal sizes.
    const keywords = rankedKeywords.map(k => ({ ...k, size: maxKeyword === minKeyword ? 30 : Math.round(14 + 34 * Math.pow((k.count - minKeyword) / (maxKeyword - minKeyword), 0.8)) }));
    const questions = Array.from(questionCounts.values()).sort((a, b) => b.count - a.count || a.question.localeCompare(b.question, 'zh-CN')).slice(0, 800).map(({ question, count, category }) => ({ question, count, categoryId: category, categoryLabel: CATEGORIES.find(c => c.id === category).label }));
    const topCategory = categories.filter(c => c.count).sort((a, b) => b.count - a.count)[0];
    const summary = total === 0
      ? (range === 'all' ? '当前没有可统计的学生提问。' : `近 ${range} 天没有可统计的学生提问。`)
      : `${range === 'all' ? '全部记录' : `近 ${range} 天`}共统计 ${total} 条学生提问，涉及 ${countedSessions.size} 个会话；${topCategory ? `提问较多的类别是“${topCategory.label}”（${topCategory.count} 条）。` : ''}当前有 ${unresolvedCount} 条被标记为暂未解答。${untimedCount ? (range === 'all' ? `其中 ${untimedCount} 条旧记录缺少可用日期，但仍纳入全部记录统计。` : `另有 ${untimedCount} 条旧记录缺少可用日期，未纳入本次范围。`) : ''}`;
    return { total, sessionCount: countedSessions.size, unresolvedCount, untimedCount, legacyRoleCount, categories, keywords, questions, summary };
  }

  function sampleSessions(now) {
    const base = parseNow(now);
    const qas = [
      ['为什么需要 Cache？','cache',true], ['为什么需要 Cache？','cache',true], ['为什么需要 Cache？','cache',true], ['为什么需要 Cache？','cache',true], ['为什么需要 Cache？','cache',true],
      ['Cache 未命中后会发生什么？','cache-miss',true], ['Cache 未命中后会发生什么？','cache-miss',true], ['Cache 未命中后会发生什么？','cache-miss',true],
      ['存储层次如何权衡速度和容量？','hierarchy',true], ['存储层次如何权衡速度和容量？','hierarchy',true], ['RAM 和 ROM 有什么区别？','ram-rom',true], ['Cache 命中率如何影响性能？','cache',true],
      ['DMA 为什么能减轻 CPU 负担？','dma',true], ['DMA 为什么能减轻 CPU 负担？','dma',true], ['DMA 为什么能减轻 CPU 负担？','dma',true], ['DMA 为什么能减轻 CPU 负担？','dma',true],
      ['中断和轮询有什么区别？','interrupt-polling',true], ['中断和轮询有什么区别？','interrupt-polling',true], ['总线有什么作用？','bus',true], ['总线有什么作用？','bus',true],
      ['冯·诺依曼结构的核心思想是什么？','von-neumann',true], ['计算机由哪些层次组成？','von-neumann',true],
      ['8 位补码能表示哪些整数？','binary',true], ['补码为什么适合做加减法？','binary',true], ['补码为什么适合做加减法？','binary',true], ['定点数和浮点数有什么区别？','floating-point',true],
      ['ISA 和处理器实现有什么区别？','isa',true], ['ISA 和处理器实现有什么区别？','isa',true], ['一条指令如何执行？','execution',true],
      ['流水线冒险有哪些类型？','pipeline',true], ['流水线冒险有哪些类型？','pipeline',true], ['流水线为什么会停顿？','pipeline',true], ['主频越高一定越快吗？','frequency',true], ['主频越高一定越快吗？','frequency',true], ['流水线为什么会停顿？','pipeline',true], ['流水线冒险有哪些类型？','pipeline',true]
    ];
    const offsets = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 10, 12, 15, 18, 21, 24, 27, 30, 33, 36, 40, 45, 52, 60, 75, 95, 120, 180];
    return offsets.map((days, index) => {
      const qa = qas[index];
      const created = new Date(base.getTime() - days * 24 * 60 * 60 * 1000 - (index % 7) * 13 * 60 * 1000);
      return {
        id: `sample-session-${index + 1}`,
        isSample: true,
        messages: [{
          id: `sample-message-${index + 1}`,
          question: qa[0],
          answer: { topic: qa[1], supported: qa[2] },
          authorRole: 'student',
          createdAt: created.toISOString(),
          isDemo: false
        }]
      };
    });
  }

  root.CourseAnalytics = { build, sampleSessions };
})(window);
