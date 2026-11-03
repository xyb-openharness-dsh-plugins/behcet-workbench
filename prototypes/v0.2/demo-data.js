// Synthetic demonstration data only; this is the sole initial record source.
window.BEIPAL_DEMO_RECORDS = [
  { id: 1, kind: '发作记录', date: '2026-10-18', endDate: '', site: '口腔', text: '口腔不适，影响进食（示例）', source: '本人记录 · 合成数据', private: false, history: [] },
  { id: 2, kind: '当前用药', date: '2026-10-10', datePrecision: 'day', endDate: '', ongoing: true, drug: '示例药物', dose: '', text: '剂量未记录', source: '本人抄录 · 合成数据', private: false, history: [],
    pathwayDetail: {
      imaging: { summary: '阶段内 1 条影像结论原文（合成示例）；只抄原文，不判读。', items: [['检查日期', '2026-10-22'], ['结论原文（逐字抄录）', '示例影像报告原文：示例描述，未见明确异常（合成示例）'], ['检查机构/来源', '合成示例影像科 · 无原件']] },
      ae: { summary: '阶段内 1 条副作用记录（合成示例）；保留等级与处理原文，不归因。', items: [['记录日期', '2026-10-16'], ['现象原文', '示例记录：服药后出现口干（合成示例）'], ['等级原文', '未记录'], ['处理原文', '示例记录：本人只记录了现象，未写处理（合成示例）']] },
      support: { summary: '阶段内 1 条支持措施；效果仅保留本人原话，不评疗效。', items: [['记录日期', '2026-10-21'], ['措施（原文）', '示例记录：记录每日饮水量（合成示例）'], ['效果（本人原话）', '“白天口干的时候会想起来喝水。”'], ['来源', '本人记录 · 合成数据'], ['性质', '合成示例，不是真实记录']] }
    } },
  { id: 6, kind: '当前用药', date: '2026-05-02', datePrecision: 'day', endDate: '2026-08-20', ongoing: false, drug: '示例既往药物', dose: '', text: '疗程结束（示例）', source: '本人抄录 · 合成数据', private: false, history: [],
    pathwayDetail: {
      imaging: { summary: '阶段内 1 条影像结论原文（合成示例）；只抄原文，不判读。', items: [['检查日期', '2026-07-18'], ['结论原文（逐字抄录）', '示例影像报告原文：未见明显异常（合成示例）'], ['检查机构/来源', '合成示例影像科 · 无原件']] },
      ae: { summary: '阶段内 1 条副作用记录（合成示例）；保留等级与处理原文，不归因。', items: [['记录日期', '2026-07-12'], ['现象原文', '示例记录：服药后出现胃部不适（合成示例）'], ['等级原文', '未记录'], ['处理原文', '示例记录：已向开药医生说明（合成示例）']] },
      support: { summary: '阶段内 1 条支持措施；效果仅保留本人原话，不评疗效。', items: [['记录日期', '2026-07-20'], ['措施（原文）', '示例记录：记录每日作息与进食时间（合成示例）'], ['效果（本人原话）', '“感觉进食比之前轻松一些。”'], ['来源', '本人记录 · 合成数据'], ['性质', '合成示例，不是真实记录']] }
    } },
  { id: 3, kind: '问题清单', date: '2026-10-25', text: '下次复诊想问的问题（示例）', source: '本人记录 · 合成数据', private: true, history: [] },
  { id: 4, kind: '资料库', date: '2026-10-18', department: '口腔科', text: '口腔科示例记录：口腔不适', source: '口腔科合成记录', original: { title: '口腔科合成原件', text: '合成原件：口腔科记录口腔不适。' }, private: false, history: [] },
  { id: 5, kind: '资料库', date: '2026-10-18', department: '眼科', text: '眼科示例记录：眼部不适', source: '眼科合成记录', original: { title: '眼科合成原件', text: '合成原件：眼科记录眼部不适。' }, private: false, history: [] }
];
// Synthetic metric catalog only: category names, item labels and expected units.
// No reference ranges, no thresholds, no grading and no clinical advice.
window.BEIPAL_METRIC_CATALOG = {
  version: 1,
  source: '合成示例目录 · 未经临床审核',
  categoryOrder: ['demo-lab', 'demo-measure', 'demo-empty'],
  categories: [
    { id: 'demo-lab', name: '示例检验' },
    { id: 'demo-measure', name: '示例测量' },
    { id: 'demo-empty', name: '示例空类别' }
  ],
  items: [
    { metricId: 'a', displayName: '示例指标 A', aliases: ['示例指标A'], categoryId: 'demo-lab', displayOrder: 10, expectedUnits: ['mg/L'], note: '仅按报告原单位记录；不同单位、方法、机构不合并、不换算。' },
    { metricId: 'b', displayName: '示例指标 B', aliases: ['示例指标B'], categoryId: 'demo-lab', displayOrder: 20, expectedUnits: ['×10⁹/L'], note: '仅按报告原单位记录；不同单位、方法、机构不合并、不换算。' },
    { metricId: 'ba', displayName: '示例指标 D', aliases: ['示例指标D'], categoryId: 'demo-lab', displayOrder: 30, expectedUnits: ['mg/L'], note: '合成示例；同一项目不同单位也会分开显示。' },
    { metricId: 'c', displayName: '示例指标 C', aliases: ['示例指标C'], categoryId: 'demo-measure', displayOrder: 40, expectedUnits: ['mm'], note: '单点记录只画点，不连线。' },
    { metricId: 'bb', displayName: '示例指标 E', aliases: ['示例指标E'], categoryId: 'demo-measure', displayOrder: 50, expectedUnits: ['mm'], note: '同一天多条记录不合并、不取平均。' },
    { metricId: 'z', displayName: '示例指标 Z', aliases: ['示例指标Z'], categoryId: 'demo-empty', displayOrder: 60, expectedUnits: ['u'], note: '合成空项目，仅用于检查目录空卡与空类别。' }
  ]
};
// Comparable groups are explicit: unit and method belong to each series.
window.BEIPAL_METRICS = [
  {id:'a', name:'示例指标 A', group:'示例检验', unit:'mg/L', method:'示例方法甲', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#216f60', points:[{date:'2026-01-15',value:4},{date:'2026-06-15',value:8},{date:'2026-09-15',value:6},{date:'2026-10-15',value:7}]},
  {id:'b', name:'示例指标 B', group:'示例检验', unit:'×10⁹/L', method:'示例方法乙', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#9a5d35', points:[{date:'2026-02-20',value:3},{date:'2026-07-10',value:5},{date:'2026-10-20',value:4}]},
  {id:'c', name:'示例指标 C', group:'示例测量', unit:'mm', method:'示例方法丙', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#76609c', points:[{date:'2026-09-25',value:12}]}
];
window.BEIPAL_EVENTS = [
  {date:'2026-09-05',type:'事件',label:'示例复诊记录'}
];
