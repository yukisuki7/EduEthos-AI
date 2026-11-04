/* Authored, bounded course-demo content. This is a preset matcher, not an AI model. */
window.COURSE_DATA = {
  chapters: [
    { id: 'overview', number: '01', title: '计算机系统概述', questions: ['计算机由哪些层次组成？', '冯·诺依曼结构的核心思想是什么？', '总线有什么作用？'] },
    { id: 'data', number: '02', title: '数据的表示与运算', questions: ['8 位补码能表示哪些整数？', '补码为什么适合做加减法？', '定点数和浮点数有什么区别？'] },
    { id: 'memory', number: '03', title: '存储系统', questions: ['为什么需要 Cache？', 'Cache 未命中后会发生什么？', '存储层次如何权衡速度和容量？'] },
    { id: 'instructions', number: '04', title: '指令系统', questions: ['ISA 和处理器实现有什么区别？', '一条指令如何执行？', '指令执行通常有哪些阶段？'] },
    { id: 'cpu', number: '05', title: '中央处理器', questions: ['流水线冒险有哪些类型？', '主频越高一定越快吗？', '流水线为什么会停顿？'] },
    { id: 'io', number: '06', title: '输入输出系统', questions: ['中断和轮询有什么区别？', 'DMA 为什么能减轻 CPU 负担？', '系统总线由什么组成？'] }
  ],
  docs: [
    { id:'doc-overview-1', title:'计算机组成与冯·诺依曼结构', chapterId:'overview', section:'系统概述', text:'计算机系统由硬件和软件协同构成。经典冯·诺依曼结构包含运算器、控制器、存储器、输入设备和输出设备；程序和数据以编码形式存放在存储器中，处理器按指令取出并执行。现代计算机有多种组织形式，这一结构是理解基本工作过程的模型。系统组织还需结合目标用途权衡通用性、实现复杂度与数据传送效率。', enabled:true, custom:false },
    { id:'doc-overview-2', title:'系统互连与总线', chapterId:'overview', section:'系统互连', text:'总线是在部件间传送信息的一组共享通信路径。常按功能区分数据总线、地址总线和控制总线：数据总线承载数据，地址总线指出访问位置，控制信号协调读写等操作。具体总线协议和拓扑会因系统而异。', enabled:true, custom:false },
    { id:'doc-data-1', title:'二进制与补码表示', chapterId:'data', section:'数据表示', text:'计算机用二进制位编码数值。n 位二进制补码的表示范围为 −2^(n−1) 到 2^(n−1)−1；例如 8 位补码范围是 −128 到 127。补码加法可由同一套二进制加法电路处理，结果仍需检查是否发生有符号溢出。增大位宽可扩大表示范围，但会增加数据存储和运算所需资源。', enabled:true, custom:false },
    { id:'doc-data-2', title:'定点数与浮点数', chapterId:'data', section:'数值表示', text:'定点表示约定小数点位置，格式简单但可表示范围受限；浮点表示用符号、阶码和尾数等字段表达数值，可覆盖较大范围，但精度有限，运算可能舍入并产生特殊情况。选用何种格式取决于范围、精度和硬件成本需求。', enabled:true, custom:false },
    { id:'doc-memory-1', title:'Cache 与局部性', chapterId:'memory', section:'高速缓存', text:'处理器与主存速度存在差距。Cache 保存近期或邻近访问的数据与指令，利用时间局部性（刚访问过的内容可能再次访问）和空间局部性（相邻地址可能很快被访问）来减少平均访存等待。Cache 容量较小、速度较快，不能保证每次访问都命中。缓存容量、命中率、访问延迟、能耗和实现成本需要结合工作负载权衡；多处理器系统还要处理缓存一致性。', enabled:true, custom:false },
    { id:'doc-memory-2', title:'存储层次与命中未命中', chapterId:'memory', section:'存储层次', text:'存储系统通常组合寄存器、Cache、主存和外存，在速度、容量与每位成本之间折衷。访问数据若在当前 Cache 层找到称为命中；未命中时，硬件按层次策略从下一级取回数据，等待时间会增加，具体延迟取决于实现。RAM 通常可读写且断电易失；ROM 类非易失存储常用于保存固件，但具体可写性因技术而异。', enabled:true, custom:false },
    { id:'doc-instructions-1', title:'指令集架构与实现', chapterId:'instructions', section:'指令系统', text:'指令集架构（ISA）定义软件可见的机器接口，例如指令、寄存器和寻址规则。微架构及处理器实现决定如何用具体电路执行该接口。同一 ISA 可以有不同实现；兼容 ISA 不意味着内部流水线、缓存或性能相同。不同实现还会在面积、功耗和性能之间作不同权衡。', enabled:true, custom:false },
    { id:'doc-instructions-2', title:'指令执行基本过程', chapterId:'instructions', section:'指令执行', text:'典型指令处理过程包括取指、译码、取得操作数、执行、访存（若需要）和写回结果。不同处理器可合并、重排或并行这些阶段，异常和控制转移也会改变流程，因此这是用于理解的概括模型。', enabled:true, custom:false },
    { id:'doc-cpu-1', title:'流水线与冒险', chapterId:'cpu', section:'流水线', text:'流水线让多条指令的不同阶段重叠，以提高吞吐率，但不必然缩短单条指令延迟。结构冒险来自资源冲突，数据冒险来自指令间数据依赖，控制冒险常由分支改变取指路径造成。处理方式包括暂停、转发、资源复制或分支预测，具体方案取决于处理器设计。更积极的重叠和预测也会增加控制复杂度、硬件资源需求和验证难度。', enabled:true, custom:false },
    { id:'doc-cpu-2', title:'处理器性能与主频', chapterId:'cpu', section:'性能评价', text:'主频表示时钟周期的频率，不单独决定程序运行时间。性能还受每条指令平均周期数、指令数量、内存等待、并行能力和工作负载等影响。比较处理器应关注目标程序上的实际完成时间或合适的基准测试，避免只凭主频下结论。', enabled:true, custom:false },
    { id:'doc-io-1', title:'程序查询与中断', chapterId:'io', section:'I/O 控制', text:'轮询由 CPU 反复检查设备状态，机制直接但可能消耗处理器时间。中断由设备在需要服务时通知 CPU，CPU 可先执行其他工作，再保存状态并转入中断处理；中断也有处理开销，适合与否取决于设备和工作负载。', enabled:true, custom:false },
    { id:'doc-io-2', title:'DMA 与 I/O 传送', chapterId:'io', section:'直接存储器访问', text:'DMA 控制器可在 CPU 设置传送参数后，在设备与主存之间搬运数据，减少 CPU 逐字节或逐字传送的参与。CPU 通常仍负责配置、协调并在传送完成或出错时处理通知；DMA 会占用总线等资源，并非没有成本。', enabled:true, custom:false }
  ]
};

const COURSE_ANSWERS = [
  { topic:'von-neumann', terms:/冯.?诺依曼|存储程序|程序和数据.{0,8}(存|放)|计算机.{0,6}(组成|结构)/i, intent:/结构|组成|核心|原理|什么是|怎么工作|思想|介绍|解释/i, chapter:'overview', sources:['doc-overview-1'], p:'经典冯·诺依曼模型把程序和数据编码后存放在存储器中，由处理器取指并执行；系统还包含运算、控制以及输入输出部件。它是理解基本组织方式的模型，现代系统会在此基础上采用更多层次和并行设计。', bullets:['程序与数据都以编码形式存储。','处理器通过取指和执行推进程序。'] },
  { topic:'binary', terms:/二进制|补码|负数表示|8位|八位/, intent:/范围|表示|为什么|加减|怎么|什么是|计算|能表示/i, chapter:'data', sources:['doc-data-1'], p:'补码把有符号整数表示为固定宽度的二进制位，便于复用二进制加法电路进行加减。n 位补码范围是 −2^(n−1) 到 2^(n−1)−1，因此 8 位范围为 −128 到 127；超出范围时要考虑溢出。', bullets:['正数最高位为 0，负数最高位为 1。','位宽决定表示范围，不能忽略溢出。'] },
  { topic:'floating-point', terms:/定点数|浮点数|浮点表示/, intent:/区别|范围|精度|什么是|比较|表示|权衡/i, chapter:'data', sources:['doc-data-2'], p:'定点数约定小数点位置，格式较简单但范围受限；浮点数用阶码和尾数等字段表示，可覆盖更大范围，但精度有限，运算可能舍入。具体适用场景取决于范围、精度和硬件成本要求。', bullets:['定点：小数点位置固定，范围较受限。','浮点：范围较大，仍有精度与舍入限制。'] },
  { topic:'cache-miss', terms:/cache|高速缓存|高速缓冲/, intent:/未命中|没命中|miss|失效/i, chapter:'memory', sources:['doc-memory-2'], p:'Cache 未命中表示所需数据不在当前缓存层。系统通常从下一级存储取回数据，再按策略更新缓存；因此会增加等待时间。影响大小取决于下一级延迟、访问模式及具体实现。', bullets:['未命中会触发下一级访问。','命中率之外，还要看未命中代价。'] },
  { topic:'cache', terms:/cache|高速缓存|高速缓冲|局部性/, intent:/为什么|作用|区别|原理|命中|未命中|失效|miss|怎么|什么是|影响|带来/i, chapter:'memory', sources:['doc-memory-1','doc-memory-2'], p:'Cache 用较小、较快的存储保存近期或邻近访问的数据，利用时间和空间局部性降低平均访存等待。命中表示数据在当前层找到；未命中则需从下一级取回，增加等待时间，但实际延迟取决于具体实现。', bullets:['时间局部性：近期访问内容可能再次使用。','空间局部性：相邻地址可能很快被访问。','命中率和未命中代价共同影响效果。'] },
  { topic:'ram-rom', terms:/ram|rom|主存|只读存储器|随机存取存储器/, intent:/区别|断电|易失|什么是|特性|比较|用途|能否/i, chapter:'memory', sources:['doc-memory-2'], p:'RAM 通常可读写且断电后内容易失；ROM 类存储通常是非易失的，常用于保存固件。不同 RAM、ROM 技术的可写性和使用方式有差异，实际要看具体存储器类型。', bullets:['RAM：通常用于运行时读写，易失。','ROM 类：通常非易失，常用于固件。'] },
  { topic:'hierarchy', terms:/存储层次|寄存器.{0,12}主存|内存层次|ram|rom|主存|外存/, intent:/区别|权衡|速度|容量|成本|为什么|作用|是什么|易失|断电|层次/i, chapter:'memory', sources:['doc-memory-2'], p:'存储层次组合寄存器、Cache、主存和外存，利用更快但较小、单位容量成本较高的层级，配合较大容量层级满足需求。RAM 通常可读写且断电易失；ROM 类非易失存储常用于固件，具体特性取决于技术。', bullets:['靠近处理器的层级通常更快、容量更小。','不同层级共同权衡速度、容量与成本。'] },
  { topic:'isa', terms:/isa|指令集架构|微架构|处理器实现|指令集/, intent:/区别|关系|什么是|兼容|相同|不同|作用|解释|比较/i, chapter:'instructions', sources:['doc-instructions-1'], p:'ISA 是软件可见的指令与寄存器等接口；微架构描述处理器内部如何实现并执行该接口。同一 ISA 可以由不同微架构实现，所以软件接口相同不代表内部结构或性能相同。', bullets:['ISA 面向软硬件接口。','实现方式可以不同，兼容性不等于性能一致。'] },
  { topic:'execution', terms:/指令执行|取指|译码|执行阶段|指令周期|指令/, intent:/过程|步骤|顺序|怎么|如何|什么是|阶段|执行/i, chapter:'instructions', sources:['doc-instructions-2'], p:'可用取指、译码、取得操作数、执行、必要时访存和写回来概括一条指令的处理过程。不同处理器会合并或重叠阶段，分支与异常也会改变流程，因此这不是所有实现都严格相同的时序图。', bullets:['取指和译码确定要执行的操作。','执行、访存和写回依指令类型而定。'] },
  { topic:'pipeline', terms:/流水线|冒险|hazard/, intent:/类型|区别|为什么|解决|处理|什么是|怎么|影响|原理|停顿/i, chapter:'cpu', sources:['doc-cpu-1'], p:'流水线把不同指令的阶段重叠以提高吞吐率。常见冒险包括结构冒险（资源冲突）、数据冒险（数据依赖）和控制冒险（分支改变取指路径）；可用暂停、转发、增加资源或预测等办法处理。', bullets:['结构冒险：同一时刻争用资源。','数据冒险：后续指令依赖尚未就绪的结果。','控制冒险：下一条取哪条指令尚不确定。'] },
  { topic:'frequency', terms:/主频|时钟频率|ghz|频率/, intent:/性能|越高|一定|快|比较|速度|影响|运行时间|什么决定/i, chapter:'cpu', sources:['doc-cpu-2'], p:'主频只说明时钟周期频率，不能单独决定程序性能。指令数、每条指令所需周期、内存等待、并行能力和工作负载都会影响完成时间；应结合目标程序的实际运行时间或合适基准比较。', bullets:['高主频不保证所有程序更快。','比较时要控制工作负载并看实际完成时间。'] },
  { topic:'bus', terms:/总线|数据总线|地址总线|控制总线/, intent:/作用|组成|区别|功能|什么是|传什么|怎么工作/i, chapter:'overview', sources:['doc-overview-2'], p:'总线提供部件之间共享的信息通路。数据总线传送数据，地址总线指出访问位置，控制信号协调读写等操作；具体实现可能采用不同协议和互连结构。', bullets:['数据：传送内容。','地址：指出目标位置。','控制：协调访问时序与操作。'] },
  { topic:'interrupt-polling', terms:/中断|轮询|查询方式|程序查询/, intent:/区别|比较|优缺点|为什么|什么时候|什么是|怎么|效率/i, chapter:'io', sources:['doc-io-1'], p:'轮询让 CPU 反复检查设备状态，简单但可能浪费处理器时间；中断由设备在需要服务时通知 CPU，让它可以先处理其他工作。中断也有保存状态和处理程序等开销，选择要看设备特性与工作负载。', bullets:['轮询：控制直接，可能频繁检查。','中断：按需通知，但有响应与处理开销。'] },
  { topic:'dma', terms:/dma|直接存储器访问|直接内存访问/, intent:/作用|为什么|原理|怎么|减轻|区别|什么是|传输|传送/i, chapter:'io', sources:['doc-io-2'], p:'DMA 由专门控制器在设备与主存之间搬运数据，减少 CPU 逐项传送的工作。CPU 仍需配置传送并处理完成或错误通知；DMA 会占用总线等资源，因此它减少参与但不等于零成本。', bullets:['CPU 配置传送，DMA 执行数据搬运。','完成或出错时仍需 CPU 参与处理。'] }
];

function answerQuestion(question, options) {
  options = options || {};
  const q = String(question || '').toLowerCase().replace(/[？?，,。！!；;：:、\s]+/g, '');
  const docs = Array.isArray(options.docs) ? options.docs : window.COURSE_DATA.docs;
  const enabled = new Map(docs.filter(d => d && d.enabled !== false).map(d => [d.id, d]));
  // Reject requests whose intent is clearly outside the bounded course Q&A, even if a course term appears.
  const outOfScope = /售价|多少钱|哪里买|购买|购物|推荐.*(电脑|处理器)|帮我写|代写|论文|作业答案|天气/.test(q);
  let hit = COURSE_ANSWERS.find(item => item.terms.test(q) && item.intent.test(q));
  // Handle a contextual follow-up only when its wording clearly asks about the previous topic.
  if (!hit && /那(没命中|未命中|命中失败)(呢|后|怎么办)?|未命中(呢|后怎么办)?/.test(q) && /^cache(?:-miss)?$/.test(options.lastTopic || '')) hit = COURSE_ANSWERS.find(x => x.topic === 'cache-miss');
  const unavailable = (topic) => ({ paragraphs:['当前演示未覆盖这个问题。可以先打开相关课程资料核对；此演示只匹配少量预置讲义问答，未连接 AI。'], bullets:[], sourceIds:[], value:'', followups:[], supported:false, label:'当前演示未覆盖', topic:topic || '' });
  if (outOfScope) return unavailable('');
  if (!hit) return unavailable('');
  const selected = hit.sources.filter(id => enabled.has(id));
  if (selected.length !== hit.sources.length) return {...unavailable(hit.topic), label:'相关资料不可用', paragraphs:['这个问题需要的课程讲义当前不可用，暂时不能给出有依据的回答。请刷新后重试；历史回答仍保留生成时的引用快照。']};
  const suggestions = {
    'von-neumann':['总线有什么作用？','一条指令如何执行？'], binary:['定点数和浮点数有什么区别？','补码为什么适合做加减法？'],
    'floating-point':['8 位补码能表示哪些整数？','补码为什么适合做加减法？'],
    cache:['Cache 未命中后会发生什么？','存储层次如何权衡速度和容量？'], 'cache-miss':['为什么需要 Cache？','存储层次如何权衡速度和容量？'],
    hierarchy:['为什么需要 Cache？','RAM 和 ROM 有什么区别？'], 'ram-rom':['存储层次如何权衡速度和容量？','为什么需要 Cache？'],
    isa:['一条指令如何执行？','指令执行通常有哪些阶段？'], execution:['ISA 和处理器实现有什么区别？','流水线冒险有哪些类型？'],
    pipeline:['主频越高一定越快吗？','一条指令如何执行？'], frequency:['流水线冒险有哪些类型？','为什么需要 Cache？'],
    bus:['冯·诺依曼结构的核心思想是什么？','DMA 为什么能减轻 CPU 负担？'],
    'interrupt-polling':['DMA 为什么能减轻 CPU 负担？','系统总线由什么组成？'], dma:['中断和轮询有什么区别？','系统总线由什么组成？']
  };
  const followups = suggestions[hit.topic] || [];
  // Authored teaching guidance, separated from the technical source excerpts.
  const teaching = {
    'von-neumann':['系统观念与协作','计算机各部件协同完成任务，提醒我们用系统观念理解复杂工程。在课程小组项目中，也应把个人任务放到共同目标中，明确接口、主动沟通，对整体结果负责。'],
    binary:['科学精神与严谨求实','补码有明确的表示边界。处理数据时，应主动核查溢出并如实说明计算限制，而不是把“程序算出了结果”当作正确性的证明。这是严谨求实、对结果负责的科学态度。'],
    'floating-point':['学术诚信与求实精神','浮点运算存在精度与舍入限制。实验报告应如实交代误差、条件和适用范围，不能只展示有利结果。尊重事实、诚实报告，比把数字写得更漂亮更重要。'],
    cache:['绿色发展与社会责任','Cache 设计不能只追求速度，也应考虑能耗与资源成本。面向实际需求选择适度的方案，让计算资源用得更有效，体现绿色发展的理念和工程师节约资源的社会责任。'],
    'cache-miss':['科学精神与诚实评价','评价 Cache 时，既要报告命中的收益，也要说明未命中的代价和测试条件。避免只挑有利数据作结论，体现实事求是、诚实评价技术方案的科学精神。'],
    hierarchy:['需求导向与资源责任','存储配置应从真实使用需求出发，不能把堆高硬件规格当作唯一目标。在满足服务要求的前提下合理使用预算与资源，是工程师对使用者和公共资源负责的体现。'],
    'ram-rom':['数据安全与职业责任','理解掉电后数据能否保留，也要关注使用者的权益。设计系统时应按需要安排备份、故障恢复和敏感数据保护，把保障用户数据安全作为职业责任，而不是等故障发生后才补救。'],
    isa:['自主创新与开放协作','区分 ISA 与具体实现，有助于把技术创新落到可验证的设计能力上。学习中既要培养自主分析和解决问题的能力，也要尊重公开规范与他人成果，在开放协作中扎实积累技术能力。'],
    execution:['规范意识与工程责任','指令执行需要各阶段按规则配合，异常也必须得到处理。写程序和做实验同样不能只验证正常情况，还应认真检查边界与异常，对系统可靠性和使用者负责，培养遵守规范的工程习惯。'],
    pipeline:['团队协作与质量责任','流水线让我们看到分工协作依赖清晰的接口与正确的衔接。在团队项目中，应主动沟通依赖、共同排查问题，不能为了进度省略必要验证；对共同成果的质量负责同样重要。'],
    frequency:['实事求是与诚信表达','“主频越高就一定越快”是把复杂问题简化成单一指标。比较和宣传技术方案时，应依据实际测试，说明条件与局限，避免夸大性能。这体现实事求是的科学态度和诚实沟通的职业操守。'],
    bus:['规则意识与协作责任','总线上的共享通信需要部件遵守共同规则。由此可以思考工程协作中的规范意识：明确接口、遵守约定、及时沟通，避免只顾局部便利而影响整体任务。技术设计也应维护共同目标。'],
    'interrupt-polling':['服务意识与责任担当','选择轮询还是中断，应服务于真实场景的响应与可靠性需求。若用于需要及时响应的设备，应认真评估延迟和异常处理，把使用者的实际需求放在指标之前，体现服务意识与工程责任。'],
    dma:['分工协作与责任担当','DMA 的分工机制可以引导我们理解：分工协作不等于责任转移。把数据搬运交给控制器后，工程师仍应认真验证配置、数据完整性与错误恢复，守住数据安全底线。在团队实践中，也应明确职责、主动协同，对系统整体结果和使用者负责。']
  }[hit.topic];
  const value = teaching?.[1] || '';
  return { paragraphs:[hit.p], bullets:hit.bullets.slice(), sourceIds:selected, value, valueTitle:value ? '课程思政 · '+teaching[0] : '', valueRevision:2, followups, supported:true, label:'预置讲义回答', topic:hit.topic };
}
window.answerQuestion = answerQuestion;
