// 这个行业的分类体系：类别、标签词表、俱乐部（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后就不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。国内五类排在前、足球四类排在后，页面与日报共用这个顺序。
 */
export const CATEGORIES = [
  { key: "china-politics", label: "时政", section: "国内时政", guide: "国内重大政策出台与调整、法律法规、人事任命、中国外交、台海与港澳事务；涉华国际新闻（中外关系、涉华国际会议与谈判、外国对华政策、台海相关军事动态）也归此类。不涉华的外国政局、战争军事、地缘博弈与国际事件一律归国际，不进此类" },
  { key: "china-society", label: "社会", section: "社会民生", guide: "社会热点事件、民生政策（教育、医疗、养老、就业）、公共安全、自然灾害与天气、舆论关注的社会现象" },
  { key: "finance", label: "财经", section: "财经商业", guide: "宏观经济数据与政策、股市债市汇市、公司重大经营与资本动态（上市、并购、暴雷）、行业走向、房地产；国际宏观经济与市场大事也归此类" },
  { key: "tech", label: "科技", section: "科技数码", guide: "科技行业与公司动态、芯片、互联网、通信、航天、新能源车、消费数码产品发布（人工智能行业内容除外）" },
  { key: "international", label: "国际", section: "国际视野", guide: "不直接涉及中国的国际新闻：外国政局与大选、战争与军事冲突、大国博弈与地缘政治、重大国际事件与国际组织动态、外国重大社会事件" },
  { key: "match", label: "比赛", section: "比赛与赛果", guide: "已结束比赛的比分、关键战报、大冷门、破纪录表现与比赛过程关键事件（进球、红牌、伤退、争议判罚瞬间），俱乐部赛事与国字号赛事同此；赛前备战、首发与伤停预测、赛前发布会也归此类。以规则修改、判罚处罚、VAR/裁判争议、联赛政策或复盘与观点评论为题的报道不进此类——按涉事主体归俱乐部，国字号相关归国家队" },
  { key: "club", label: "俱乐部", section: "俱乐部与国家队", guide: "俱乐部经营、人事、财政、收购、队内动态；针对俱乐部的判罚处罚、VAR/裁判争议与涉俱乐部的规则变化；围绕俱乐部及其比赛的复盘、战术解读、观点评论与深度访谈；足球产业与治理、联赛规则政策、转播与商业动态归此类" },
  { key: "national", label: "国家队", section: "俱乐部与国家队", guide: "国家队大名单、大赛征程、国字号球队动态、国际比赛日；针对国字号的判罚处罚与规则变化、围绕国字号比赛的复盘与观点评论也归此类；国字号比赛的赛果与赛前备战归比赛类" },
  { key: "transfer", label: "转会", section: "转会窗", guide: "转会官宣、达成协议、租借、续约、解约，以及有实质进展的转会传闻" },
  { key: "github", label: "GitHub", section: "GitHub 热门项目", guide: "仅由 GitHub showcase 专用通道入库的开源项目条目；新闻资料一律不归此类，按其内容归对应新闻类别" },
] as const satisfies ReadonlyArray<{ key: string; label: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告、
 * 公司编年史的上面一行都按它数。category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写，只对拉丁字母缩写生效）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["gdp", "cpi", "ai", "var", "ffp", "uefa", "fifa"];

/**
 * 内容理解一步给每篇资料判的"内容类型"（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["transfer_deal", "match_result", "coaching_move", "injury_suspension", "governance_event", "opinion_analysis", "misc_update", "policy_news", "social_event", "business_finance", "tech_update"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些"分类标签"之一。 */
export const CATEGORY_TAGS = [
  "转会官宣", "转会传闻", "比赛赛果", "赛前动态", "伤病停赛", "教练变动", "国家队", "规则/判罚", "财政/收购", "足球产业", "深度/观点", "时政要闻", "社会热点", "财经商业", "科技数码", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "英超", "西甲", "意甲", "德甲", "法甲", "中超", "欧冠", "欧联", "世界杯", "欧洲杯", "亚洲杯", "亚冠", "世俱杯", "欧国联", "足总杯", "国王杯", "金球奖", "女足", "青训",
  "中美关系", "台海", "房地产", "芯片", "新能源", "航天",
] as const;

/** 可选的实体标签（俱乐部、国家队、机构、公司）。 */
export const ENTITY_TAGS = [
  "皇马", "巴塞罗那", "马德里竞技", "曼城", "阿森纳", "利物浦", "曼联", "切尔西", "热刺", "纽卡斯尔", "拜仁", "多特蒙德", "勒沃库森",
  "国际米兰", "AC米兰", "尤文图斯", "那不勒斯", "巴黎圣日耳曼", "国足", "日本队", "韩国队", "FIFA", "欧足联", "中国足协",
  "华为", "腾讯", "阿里巴巴", "字节跳动", "比亚迪", "宁德时代", "央行", "财政部",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "官宣转会": "转会官宣", "正式加盟": "转会官宣", "正式签约": "转会官宣", "续约": "转会官宣", "租借": "转会官宣", "转会": "转会官宣",
  "传闻": "转会传闻", "流言": "转会传闻", "here we go": "转会传闻",
  "赛果": "比赛赛果", "战报": "比赛赛果", "比分": "比赛赛果", "比赛结果": "比赛赛果", "晋级": "比赛赛果", "出局": "比赛赛果", "夺冠": "比赛赛果",
  "前瞻": "赛前动态", "预热": "赛前动态", "发布会": "赛前动态", "备战": "赛前动态",
  "伤病": "伤病停赛", "伤停": "伤病停赛", "停赛": "伤病停赛", "禁赛": "伤病停赛",
  "帅位变动": "教练变动", "下课": "教练变动", "上任": "教练变动", "换帅": "教练变动",
  "国字号": "国家队", "国际比赛日": "国家队", "世预赛": "国家队",
  "规则": "规则/判罚", "判罚": "规则/判罚", "处罚": "规则/判罚", "VAR": "规则/判罚", "裁判": "规则/判罚", "纪律": "规则/判罚",
  "收购": "财政/收购", "易主": "财政/收购", "FFP": "财政/收购", "财政": "财政/收购", "财政公平": "财政/收购", "注资": "财政/收购",
  "商业": "足球产业", "转播": "足球产业", "赞助": "足球产业", "治理": "足球产业",
  "评论": "深度/观点", "分析": "深度/观点", "战术": "深度/观点", "复盘": "深度/观点", "访谈": "深度/观点", "专栏": "深度/观点",
  "政策": "时政要闻", "时政": "时政要闻", "人事": "时政要闻", "外交": "时政要闻", "官宣人事": "时政要闻",
  "社会": "社会热点", "民生": "社会热点", "热点事件": "社会热点", "公共安全": "社会热点",
  "财经": "财经商业", "经济": "财经商业", "金融": "财经商业", "股市": "财经商业", "公司": "财经商业", "宏观数据": "财经商业",
  "科技": "科技数码", "数码": "科技数码", "互联网": "科技数码", "新能源车": "科技数码",
  "英超联赛": "英超", "西甲联赛": "西甲", "意甲联赛": "意甲", "德甲联赛": "德甲", "法甲联赛": "法甲",
  "欧洲冠军联赛": "欧冠", "欧联杯": "欧联", "金球": "金球奖",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  transfer_deal: "转会官宣", match_result: "比赛赛果", coaching_move: "教练变动", injury_suspension: "伤病停赛",
  governance_event: "规则/判罚", opinion_analysis: "深度/观点", misc_update: "其他",
  policy_news: "时政要闻", social_event: "社会热点", business_finance: "财经商业", tech_update: "科技数码",
};

// ── 俱乐部与主体 ─────────────────────────────────────────────────────────────────────────

/**
 * 主体名录：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是主体自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  "real-madrid": { name: "皇家马德里", displayTag: "皇马", aliases: ["皇马", "皇家马德里", "Real Madrid"] },
  barcelona: { name: "巴塞罗那", displayTag: "巴塞罗那", aliases: ["巴萨", "巴塞罗那", "FC Barcelona"] },
  "atletico-madrid": { name: "马德里竞技", displayTag: "马德里竞技", aliases: ["马竞", "马德里竞技", "Atletico"] },
  "man-city": { name: "曼城", displayTag: "曼城", aliases: ["曼城", "曼彻斯特城", "Man City"] },
  arsenal: { name: "阿森纳", displayTag: "阿森纳", aliases: ["阿森纳", "Arsenal", "枪手"] },
  liverpool: { name: "利物浦", displayTag: "利物浦", aliases: ["利物浦", "Liverpool", "红军"] },
  "man-utd": { name: "曼联", displayTag: "曼联", aliases: ["曼联", "曼彻斯特联", "Man Utd", "红魔"] },
  chelsea: { name: "切尔西", displayTag: "切尔西", aliases: ["切尔西", "Chelsea", "蓝军"] },
  tottenham: { name: "热刺", displayTag: "热刺", aliases: ["热刺", "托特纳姆热刺", "Tottenham", "Spurs"] },
  newcastle: { name: "纽卡斯尔", displayTag: "纽卡斯尔", aliases: ["纽卡", "纽卡斯尔", "Newcastle", "喜鹊"] },
  bayern: { name: "拜仁慕尼黑", displayTag: "拜仁", aliases: ["拜仁", "拜仁慕尼黑", "Bayern"] },
  dortmund: { name: "多特蒙德", displayTag: "多特蒙德", aliases: ["多特", "多特蒙德", "Dortmund", "BVB"] },
  leverkusen: { name: "勒沃库森", displayTag: "勒沃库森", aliases: ["勒沃库森", "药厂", "Leverkusen"] },
  inter: { name: "国际米兰", displayTag: "国际米兰", aliases: ["国米", "国际米兰", "Inter"] },
  milan: { name: "AC米兰", displayTag: "AC米兰", aliases: ["AC米兰", "米兰", "AC Milan"] },
  juventus: { name: "尤文图斯", displayTag: "尤文图斯", aliases: ["尤文", "尤文图斯", "Juventus", "老妇人"] },
  napoli: { name: "那不勒斯", displayTag: "那不勒斯", aliases: ["那不勒斯", "Napoli"] },
  psg: { name: "巴黎圣日耳曼", displayTag: "巴黎圣日耳曼", aliases: ["巴黎", "巴黎圣日耳曼", "PSG", "大巴黎"] },
  "china-national": { name: "中国男足", displayTag: "国足", aliases: ["国足", "中国男足", "中国国家队", "中国队"] },
  fifa: { name: "国际足联", displayTag: null, aliases: ["国际足联", "FIFA"] },
  uefa: { name: "欧足联", displayTag: null, aliases: ["欧足联", "UEFA"] },
};

/**
 * 身份词典：摘要和标题里出现的俱乐部，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "real-madrid", name: "皇家马德里", patterns: [/皇马|皇家马德里|real\s?madrid/i] },
  { id: "barcelona", name: "巴塞罗那", patterns: [/巴萨|巴塞罗那|barcelona/i] },
  { id: "atletico-madrid", name: "马德里竞技", patterns: [/马竞|马德里竞技|atletico/i] },
  { id: "man-city", name: "曼城", patterns: [/曼城|曼彻斯特城|man\s?city/i] },
  { id: "arsenal", name: "阿森纳", patterns: [/阿森纳|arsenal|枪手/i] },
  { id: "liverpool", name: "利物浦", patterns: [/利物浦|liverpool/i] },
  { id: "man-utd", name: "曼联", patterns: [/曼联|曼彻斯特联|man\s?u(nited|td)/i] },
  { id: "chelsea", name: "切尔西", patterns: [/切尔西|chelsea|蓝军/i] },
  { id: "tottenham", name: "热刺", patterns: [/热刺|托特纳姆|tottenham|spurs/i] },
  { id: "newcastle", name: "纽卡斯尔", patterns: [/纽卡斯尔|纽卡|newcastle|喜鹊/i] },
  { id: "bayern", name: "拜仁慕尼黑", patterns: [/拜仁|bayern/i] },
  { id: "dortmund", name: "多特蒙德", patterns: [/多特|dortmund|\bbvb\b/i] },
  { id: "leverkusen", name: "勒沃库森", patterns: [/勒沃库森|leverkusen|药厂/i] },
  { id: "inter", name: "国际米兰", patterns: [/国米|国际米兰|inter\s?milan/i] },
  { id: "milan", name: "AC米兰", patterns: [/ac\s?milan|AC米兰/i] },
  { id: "juventus", name: "尤文图斯", patterns: [/尤文|juventus/i] },
  { id: "napoli", name: "那不勒斯", patterns: [/那不勒斯|napoli/i] },
  { id: "psg", name: "巴黎圣日耳曼", patterns: [/巴黎圣日耳曼|\bpsg\b|大巴黎/i] },
  { id: "china-national", name: "中国男足", patterns: [/国足|中国男足|中国国家队|中国队/i] },
  { id: "fifa", name: "国际足联", patterns: [/\bfifa\b|国际足联/i] },
  { id: "uefa", name: "欧足联", patterns: [/\buefa\b|欧足联/i] },
];

/** 这些域名上的文章，发布方就是对应的俱乐部或机构（媒体聚合站不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "real-madrid", domains: ["realmadrid.com"] },
  { entityId: "barcelona", domains: ["fcbarcelona.com"] },
  { entityId: "man-city", domains: ["mancity.com"] },
  { entityId: "liverpool", domains: ["liverpoolfc.com"] },
  { entityId: "man-utd", domains: ["manutd.com"] },
  { entityId: "arsenal", domains: ["arsenal.com"] },
  { entityId: "bayern", domains: ["fcbayern.com"] },
  { entityId: "fifa", domains: ["fifa.com"] },
  { entityId: "uefa", domains: ["uefa.com"] },
];

/** 原文里的这些写法也算提到了对应俱乐部。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "real-madrid", pattern: /\bLos\s+Blancos\b|\bMerengues\b/i },
  { entityId: "man-utd", pattern: /\bRed\s+Devils\b/i },
  { entityId: "liverpool", pattern: /\bThe\s+Kop\b/i },
  { entityId: "bayern", pattern: /\bDie\s+Roten\b|\bFC\s+Bayern\b/i },
];

/** 分类分区：足球类（其余为国内新闻类）；网站筛选栏与卡片角标据此做视觉分组。 */
export const FOOTBALL_CATEGORIES: ReadonlySet<string> = new Set(["match", "club", "national", "transfer"]);
