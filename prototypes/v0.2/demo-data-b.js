// 第二套合成示例档案（B）：短时段、日期/单位不完整。仅用于原型演示，不含真实患者资料。
// 由候选示例整理进仓库；A 仍是 demo-data.js 的默认组，刷新或切换后都回到 A。
window.BEIPAL_SET_B = {
  id: 'courseB',
  label: '示例组 B · 短时段 / 资料不全',
  synthetic: true,
  records: [
    { id: 201, kind: '发作记录', date: '2026-06-21', endDate: '2026-06-28', site: '口腔', text: '口腔不适，进食受影响（示例 B）', source: '本人记录 · 合成数据 B', private: false, history: [] },
    { id: 202, kind: '发作记录', date: '2026-07', datePrecision: 'month', endDate: '', site: '皮肤', text: '皮肤不适，只记得是七月（示例 B）', source: '本人记录 · 合成数据 B', private: false, history: [] },
    { id: 203, kind: '发作记录', date: '', datePrecision: 'unknown', endDate: '', site: '', text: '记不清日期的口腔不适（示例 B）', source: '本人补记 · 合成数据 B', private: false, history: [] },
    { id: 204, kind: '当前用药', date: '2026-08-14', datePrecision: 'day', endDate: '', ongoing: true, drug: '示例药物 B1', dose: '', text: '按处方抄录，剂量未记录（示例 B）', source: '本人抄录 · 合成数据 B', private: false, history: [],
      pathwayDetail: {
        imaging: { summary: '阶段内 1 条影像结论原文（合成示例 B）；只抄原文，不判读。', items: [['检查日期', '2026-09-18'], ['结论原文（逐字抄录）', '示例影像报告原文：未见明确异常（合成示例 B）'], ['检查机构/来源', '合成示例影像科 B · 无原件']] },
        ae: { summary: '阶段内 1 条副作用记录（合成示例 B）；保留等级与处理原文，不归因。', items: [['记录日期', '2026-09-10'], ['现象原文', '示例记录：服药后出现口干（合成示例 B）'], ['等级原文', '未记录'], ['处理原文', '示例记录：本人只记录了现象，未写处理（合成示例 B）']] },
        support: { summary: '阶段内 1 条支持措施；效果仅保留本人原话，不评疗效。', items: [['记录日期', '2026-09-22'], ['措施（原文）', '示例记录：记录每日饮水量（合成示例 B）'], ['效果（本人原话）', '“白天口干的时候会想起来喝水。”'], ['来源', '本人记录 · 合成数据 B'], ['性质', '合成示例，不是真实记录']] }
      } },
    { id: 205, kind: '当前用药', date: '2026-10-12', datePrecision: 'day', endDate: '', ongoing: false, drug: '示例药物 B2', dose: '', text: '私密治疗记录（示例 B）', source: '本人抄录 · 合成数据 B', private: true, history: [] },
    { id: 206, kind: '问题清单', date: '2026-10-20', text: '下次复诊想问的问题（示例 B，私密）', source: '本人记录 · 合成数据 B', private: true, history: [] },
    { id: 207, kind: '资料库', date: '2026-09-30', department: '皮肤科', text: '皮肤科示例记录：皮肤不适（示例 B）', source: '皮肤科合成记录 B', original: { title: '皮肤科合成原件 B', text: '合成原件：皮肤科记录皮肤不适（示例 B）。' }, private: false, history: [] }
  ],
  metrics: [
    { id: 'ba', name: '示例指标 D', group: '示例检验', unit: 'mg/L', method: '示例方法丁', laboratory: '合成示例机构 B', source: '合成示例 B · 无原件', color: '#216f60',
      points: [{ date: '2026-06-30', value: 8 }, { date: '2026-08-25', value: 6 }, { date: '2026-10-18', value: 5 }, { date: '2026-10-22', value: 4, unit: '' }] },
    { id: 'bb', name: '示例指标 E', group: '示例测量', unit: 'mm', method: '示例方法戊', laboratory: '合成示例机构 B', source: '合成示例 B · 无原件', color: '#9a5d35',
      points: [{ date: '2026-09-15', value: 9 }, { date: '2026-09-15', value: 11 }] }
  ],
  events: [
    { date: '2026-09-03', type: '事件', label: '复诊（示例 B）' },
    { date: '2026-10-20', type: '事件', label: '再次复诊（示例 B）' }
  ]
};