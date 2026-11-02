/* 内容依据 docs/CLINICAL-DATA-2026.md；证据编号见 docs/USER-RESEARCH.md。
   概要整体属第 ② 层（解释）：只整理公开信息与原文，不生成任何与你个人有关的判断。
   本节文字由人工撰写，尚未经临床审核。
   口径说明（2026-11-02 修订）：治疗全景段只保留「类别」级概述，不写具体药物选择、疗效、剂量、给药方案与手术指征；
   本段固定出口句因此改写为「按受累器官排列」，与 docs/36-DISEASE-PRIMER.md 与 templates/DISEASE-PRIMER.md 所载固定出口原话不一致，
   该差异待项目负责人回写规范模板后再行对齐；趋势段不写「分类体系未变」之类无全局依据的结论。 */
window.DISEASE_PRIMER = {
  brand: '小贝宝', name: '白塞病 / 贝赫切特综合征', en: 'Behçet’s syndrome', updated: '2026-11-02',
  sections: [
    {
      id: 'definition', title: '定义',
      intro: '国家卫生健康委《86 个罕见病病种诊疗指南（2025 年版）》第 9 章以「白塞病/贝赫切特综合征」为题：白塞病（Behçet’s disease，BD）又称贝赫切特综合征，是一种以血管炎为基本病理改变的慢性、复发性自身免疫/炎症性疾病。它主要引起反复发作的口腔溃疡、生殖器溃疡、葡萄膜炎和皮肤损害，也可以累及心脏及大血管、神经系统、胃肠道和关节；不同患者的受累部位和病程差别很大。近年不少文献把它称作白塞综合征（Behçet’s syndrome，BS）。',
      points: [
        '常见表型（原文按症候集簇列举）：皮肤黏膜型、关节型、血管型、胃肠型、眼型和中枢神经系统型。',
        '发病年龄：原文写「发病年龄多为 15～50 岁，中位发病年龄 34 岁」。',
        '患病率：原文写全球综合患病率 10.3/10 万，中国估测约 14/10 万、北方可高达 110/10 万。本项目不用这个数字推算现在有多少患者。',
        '第 9 章原文写「BD 无特异性生物标志物或病理组织学特征」，诊断主要依据临床症状，由医生综合病史和表现判断。第 9 章也收录了 2014 年国际白塞病标准（ICBD）评分系统，那是给临床使用的分类工具，不是自测表。',
        '来源口径：第 9 章正文与表 9-1 写 ICBD 2014；同章图 9-1 的方框里写「2013年ICBD国际白塞诊断标准」。本轮已把该页渲染成图逐格判读，确认图上确实写作 2013，与正文/表不一致；差异原因未核。NHS 页面的诊断表述与国家指南的 ICBD 框架结构性不同，两者不能拼接成自测。',
        '本项目患者访谈 0 次，临床审核 0 次；以下文字由人工整理，尚未经临床专业人员审核，不用于诊断或自我判断。'
      ],
      sources: [
        { org: '国家卫生健康委办公厅', doc: '86 个罕见病病种诊疗指南（2025 年版）· 第 9 章 白塞病/贝赫切特综合征', version: '2025 年版（国卫办医政函〔2025〕252 号，2025-06-17）', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: '官方 PDF 直链；本轮下载核验：200 / application/pdf / 15,611,195 字节 / 517 页；图 9-1 经图像判读' },
        { org: 'NHS', doc: 'Behçet’s disease', version: '页面标注最后复核 2023-04-06，下次复核 2026-04-06', original: true, kind: 'fulltext', url: 'https://www.nhs.uk/conditions/behcets-disease/', note: '英国患者信息原页；诊断框架与第 9 章不同' }
      ]
    },
    {
      id: 'evidence', title: '医学资料规范和指南情况',
      intro: '下表逐行说明本项目实际拿到了哪些文件的原件、哪些只拿到题录或二次来源，以及各自用来支持哪一块内容。未取得原件的行只记录「这份文件存在、大致讲什么」，不引用其中条文。',
      table: { head: ['机构', '文件', '版本 / 年份', '原件', '本台的用途'], rows: [
        ['国家卫生健康委办公厅', '86 个罕见病病种诊疗指南（2025 年版）· 第 9 章 白塞病/贝赫切特综合征', '2025 年版（国卫办医政函〔2025〕252 号，2025-06-17）',
          { text: '原件已取得：官方 PDF，第 9 章 PDF 54–60 页（印刷 50–56）', kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf' },
          '定义、诊断框架与分器官治疗类别的引用依据'],
        ['NHS', 'Behçet’s disease（患者信息页）', '页面标注最后复核 2023-04-06，下次复核 2026-04-06',
          { text: '原件已取得：网页正文', kind: 'fulltext', url: 'https://www.nhs.uk/conditions/behcets-disease/' },
          '只作英语患者信息的对照；其诊断框架不与第 9 章合并'],
        ['EULAR', '2018 update of the EULAR recommendations for the management of Behçet’s syndrome', 'Ann Rheum Dis 2018;77(6):808–818',
          { text: '未取得原件，据二次来源：国家指南第 9 章参考文献', nolink: true, note: '原文在 Annals of the Rheumatic Diseases，需订阅；本轮脚本访问 ard.bmj.com 得 403' },
          '仅用于记录该版建议的题录信息与存在；不引用其中推荐'],
        ['EULAR', 'EULAR recommendations for the management of Behçet’s syndrome: 2025 update', '在线发表 2026-03-23；Ann Rheum Dis 2026;85(6):1010–1025',
          { text: '未取得原件，据二次来源：PubMed 题录', nolink: true, note: 'Europe PMC 记录 isOpenAccess=N、inPMC=N；全文未取得，只核到题录与摘要' },
          '仅用于记录该版更新的题录与存在；不引用其中推荐'],
        ['中华医学会风湿病学分会', '白塞综合征诊疗规范', '2021 年（Zhonghua Nei Ke Za Zhi 2021）',
          { text: '未取得原件，据二次来源：Europe PMC 题录', kind: 'registry', url: 'https://europepmc.org/article/MED/34551473', note: 'Europe PMC 记录 isOpenAccess=N；全文与页码未取得' },
          '仅用于记录该规范存在；本版暂不作引用依据']
      ] },
      sources: [
        { org: '国家卫生健康委办公厅', doc: '86 个罕见病病种诊疗指南（2025 年版）· 第 9 章', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'EULAR 2018 一行在本台的二次来源' },
        { org: 'NHS', doc: 'Behçet’s disease', version: '最后复核 2023-04-06', original: true, kind: 'fulltext', url: 'https://www.nhs.uk/conditions/behcets-disease/' },
        { org: 'EULAR', doc: '2018 update of the EULAR recommendations for the management of Behçet’s syndrome', version: '2018', original: false, secondaryUrl: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', note: '二次来源：国家指南第 9 章参考文献；全文未取得' },
        { org: 'PubMed', doc: 'EULAR recommendations for the management of Behçet’s syndrome: 2025 update · PMID 41876291', version: '在线发表 2026-03-23', original: true, kind: 'registry', url: 'https://pubmed.ncbi.nlm.nih.gov/41876291/', note: '题录与摘要（DOI 10.1016/j.ard.2026.02.009），不是全文' },
        { org: 'Europe PMC', doc: '《白塞综合征诊疗规范》题录 · PMID 34551473', version: '2021', original: true, kind: 'registry', url: 'https://europepmc.org/article/MED/34551473', note: '题录，不是全文' }
      ]
    },
    {
      id: 'landscape', title: '目前治疗全景概要',
      intro: '下面按国家指南第 9 章的原文只列出治疗的类别，不列具体药物、不给选择顺序、不写疗效与手术指征，也不判断哪一类适合谁。原文同时写明：「BD 目前尚无公认的有效根治药物」，治疗目标是迅速抑制炎症、防止复发、防止不可逆的器官损伤、延缓疾病进展；具体用哪一类、怎么用，由医生按年龄、性别、器官受累类型及严重程度个体化决定，本台不写。',
      groups: [
        { label: '1 一般治疗（类别）', points: [
          '日常口腔卫生；平时不宜进食过硬或温度过高的食物，避免进食刺激性食物。',
          '发生口腔或生殖器溃疡时做伤口护理，避免继发细菌感染。'
        ] },
        { label: '2 局部治疗（类别）', points: [
          '口腔、外阴溃疡：使用局部（外用）药物减轻局部炎症。',
          '眼部：可由眼科医生在眼局部给药，控制眼内炎症。'
        ] },
        { label: '3 全身药物治疗（类别）', points: [
          '按作用粗略分为几类：非甾体抗炎药、改善病情的抗炎与免疫调节药、糖皮质激素、生物制剂（含单抗类 TNFα 抑制剂）、α 干扰素等。',
          '医生按受累器官和病情轻重，决定用哪一类、用多久。',
          '同一类里具体选哪种药、剂量、疗程、何时加量减量或换药，都属于处方与随访判断，本台不写。'
        ] },
        { label: '4 外科与介入（类别）', points: [
          '少数严重器官损害（如消化道并发症、大血管病变、心脏瓣膜问题）可能由外科或介入方式处理；是否做、何时做由相关专科医生判断。'
        ] },
        { label: '固定出口', points: [
          '以上是文献与指南里列出的手段类别，按受累器官与病情轻重排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。'
        ] }
      ],
      sources: [
        { org: '国家卫生健康委办公厅', doc: '86 个罕见病病种诊疗指南（2025 年版）· 第 9 章 白塞病/贝赫切特综合征 · 治疗（类别）', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 58–59（印刷 54–55）', note: '只取该章的治疗类别框架；本台不抄具体药物选择、疗效、剂量、给药方案与手术指征' }
      ]
    },
    {
      id: 'trend', title: '发展趋势',
      intro: '本段只列本轮核实到的、已经发生且有日期或版本号的事实，不写对将来的判断，也不评价哪一版更好。',
      points: [
        '2018 年 · 指南版本更替：EULAR 发布「2018 update of the EULAR recommendations for the management of Behçet’s syndrome」，刊于 Ann Rheum Dis 2018;77(6):808–818。原件（期刊全文）未取得，据二次来源国家指南第 9 章参考文献；本轮经 Europe PMC 题录核对，PMID 29625968。',
        '2021 年 · 指南版本更替：中华医学会风湿病学分会《白塞综合征诊疗规范》（Zhonghua Nei Ke Za Zhi 2021）发表并存目。原件未取得，据 Europe PMC 题录 PMID 34551473。',
        '2025-06-17 · 指南发布：国家卫生健康委办公厅以国卫办医政函〔2025〕252 号印发《软骨发育不全等 86 个罕见病病种诊疗指南（2025 年版）》；白塞病/贝赫切特综合征为第 9 章。原件已取得，为官方 PDF。',
        '2026-03-23 · 指南版本更替：EULAR 2025 更新在线发表（Ann Rheum Dis 2026;85(6):1010–1025，DOI 10.1016/j.ard.2026.02.009）。原件（期刊全文）未取得，据 Europe PMC 题录与摘要核对到：该更新由 5 条总则和 12 条建议组成，其中 1 条为新增、7 条修改内容、4 条仅改措辞；全文推荐细节未取得，本台不引用。'
      ],
      sources: [
        { org: '国家卫生健康委办公厅', doc: '86 个罕见病病种诊疗指南（2025 年版）· 第 9 章', version: '2025 年版', original: true, kind: 'pdf', url: 'https://www.gov.cn/zhengce/zhengceku/202507/P020250710595668350272.pdf', page: 'PDF 54–60（印刷 50–56）', note: 'EULAR 2018 一行在本台的二次来源' },
        { org: 'Europe PMC', doc: '《白塞综合征诊疗规范》题录 · PMID 34551473', version: '2021', original: true, kind: 'registry', url: 'https://europepmc.org/article/MED/34551473', note: '题录，不是全文' },
        { org: 'PubMed', doc: 'EULAR recommendations for the management of Behçet’s syndrome: 2025 update · PMID 41876291', version: '在线发表 2026-03-23', original: true, kind: 'registry', url: 'https://pubmed.ncbi.nlm.nih.gov/41876291/', note: '题录与摘要，不是全文；全文需订阅' }
      ]
    }
  ]
};
