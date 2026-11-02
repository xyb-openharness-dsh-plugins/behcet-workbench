/* 内容依据 docs/CLINICAL-DATA-2026.md；证据编号见 docs/USER-RESEARCH.md。 */
window.DISEASE_PRIMER = {
  brand: '小贝宝', name: '白塞病 / 贝赫切特综合征', en: 'Behçet’s syndrome', updated: '2026-11-02',
  sections: [
    {
      id: 'definition', title: '定义',
      intro: '国家指南第 9 章以「白塞病/贝赫切特综合征」为题，涵盖定义、黏膜和皮肤、眼、血管、神经与消化系统等内容。',
      points: ['国家指南正文与表 9-1 写 ICBD 2014，图 9-1 中写 ICBD 2013；差异原因未核。NHS 的诊断表述与国家指南的 ICBD 框架结构性不同，不拼接为自测。', '本项目患者访谈 0 次，临床审核 0 次。'],
      sources: [
        { org: '国家卫生健康委', doc: '86 个罕见病病种诊疗指南，第 9 章（E08）', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'kind: pdf' },
        { org: 'NHS', doc: 'Behçet’s disease（E10）', version: '最后复核 2023-04-06', original: true, kind: 'fulltext', url: 'https://www.nhs.uk/conditions/behcets-disease/', note: 'kind: fulltext' }
      ]
    },
    {
      id: 'evidence', title: '医学资料规范和指南情况',
      intro: '国家指南第 9 章涵盖检查及分器官治疗。其诊断标准和治疗内容面向临床。',
      points: ['EULAR 2018 建议（Ann Rheum Dis 2018;77:808–818）：未取得原件，据二次来源国家指南。', 'EULAR 2025 更新：未取得原件，据二次来源 RheumNow；PubMed 题录记录 DOI 10.1016/j.ard.2026.02.009。'],
      table: { head: ['资料', '版本', '文件'], rows: [
        ['国家指南第 9 章', '2025 年版', { text: '官方 PDF（pdf），第 54–60 页', kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf' }],
        ['NHS 页面', '最后复核 2023-04-06', { text: 'NHS 原页（fulltext）', kind: 'fulltext', url: 'https://www.nhs.uk/conditions/behcets-disease/' }]
      ] },
      sources: [
        { org: '国家卫生健康委', doc: '86 个罕见病病种诊疗指南，第 9 章（E08；亦为 EULAR 2018 二次来源）', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'kind: pdf' },
        { org: 'EULAR', doc: '2018 建议（E03）', version: '2018', original: false, secondaryUrl: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', note: '二次来源：国家指南；kind: pdf' },
        { org: 'EULAR', doc: '2025 更新（E09）', version: '2025 更新，2026-03-23 在线发表', original: false, secondaryUrl: 'https://rheumnow.com/news/eular-2025-update-behcets-syndrome', note: '二次来源：RheumNow；kind: fulltext' },
        { org: 'PubMed', doc: 'EULAR 2025 更新题录 41876291', version: '2026-03-23', original: true, kind: 'registry', url: 'https://pubmed.ncbi.nlm.nih.gov/41876291/', note: '题录，非全文；kind: registry' }
      ]
    },
    {
      id: 'landscape', title: '目前治疗全景概要',
      intro: '国家指南第 9 章覆盖分器官治疗，涉及黏膜和皮肤、眼、血管、神经与消化系统；这里仅说明资料覆盖范围。',
      sources: [{ org: '国家卫生健康委', doc: '86 个罕见病病种诊疗指南，第 9 章（E08）', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'kind: pdf' }]
    },
    {
      id: 'trend', title: '发展趋势',
      points: ['2018 年 · EULAR 2018 版：建议发表于 Ann Rheum Dis 2018;77:808–818。未取得原件，据二次来源国家指南。', '2025 年 · 国家指南 2025 年版：发布《86 个罕见病病种诊疗指南》，第 9 章为白塞病/贝赫切特综合征。', '2026-03-23 · EULAR 2025 更新版：PubMed 题录记录在线发表。未取得原件，据二次来源 RheumNow。'],
      sources: [
        { org: '国家卫生健康委', doc: '86 个罕见病病种诊疗指南，第 9 章（E08）', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'kind: pdf；EULAR 2018 的二次来源' },
        { org: 'EULAR', doc: '2025 更新（E09）', version: '2025 更新，2026-03-23 在线发表', original: false, secondaryUrl: 'https://rheumnow.com/news/eular-2025-update-behcets-syndrome', note: '二次来源：RheumNow；kind: fulltext' },
        { org: 'PubMed', doc: 'EULAR 2025 更新题录 41876291', version: '2026-03-23', original: true, kind: 'registry', url: 'https://pubmed.ncbi.nlm.nih.gov/41876291/', note: '题录，非全文；kind: registry' }
      ]
    }
  ]
};
