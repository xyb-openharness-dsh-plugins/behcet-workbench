// Synthetic demonstration data only; this is the sole initial record source.
window.BEIPAL_DEMO_RECORDS = [
  { id: 1, kind: '发作记录', date: '2026-10-18', text: '口腔不适，影响进食（示例）', source: '本人记录 · 合成数据', private: false, history: [] },
  { id: 2, kind: '当前用药', date: '2026-10-10', text: '示例药物，剂量未记录', source: '本人抄录 · 合成数据', private: false, history: [] },
  { id: 3, kind: '问题清单', date: '2026-10-25', text: '下次复诊想问的问题（示例）', source: '本人记录 · 合成数据', private: true, history: [] }
];
// Comparable groups are explicit: unit and method belong to each series.
window.BEIPAL_METRICS = [
  {id:'a', name:'示例指标 A', group:'示例检验', unit:'mg/L', method:'示例方法甲', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#216f60', points:[{date:'2026-01-15',value:4},{date:'2026-06-15',value:8},{date:'2026-09-15',value:6},{date:'2026-10-15',value:7}]},
  {id:'b', name:'示例指标 B', group:'示例检验', unit:'×10⁹/L', method:'示例方法乙', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#9a5d35', points:[{date:'2026-02-20',value:3},{date:'2026-07-10',value:5},{date:'2026-10-20',value:4}]},
  {id:'c', name:'示例指标 C', group:'示例测量', unit:'mm', method:'示例方法丙', laboratory:'合成示例机构', source:'合成示例 · 无原件', color:'#76609c', points:[{date:'2026-09-25',value:12}]}
];
window.BEIPAL_EVENTS = [
  {date:'2026-05-20',type:'治疗',label:'示例治疗记录'},
  {date:'2026-09-05',type:'事件',label:'示例复诊记录'}
];
