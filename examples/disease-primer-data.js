/* 36 号 · 疾病概要 示例数据
 * 用途：演示四段结构与措辞口径，不是临床资料。
 * 真实项目请复制 templates/DISEASE-PRIMER.md 的填空表，逐条补来源。
 */
window.DISEASE_PRIMER = {
  brand: '演示工作台',
  name: '软组织肉瘤',
  en: 'Soft Tissue Sarcoma（STS）',
  updated: '2026-10-25',
  sections: [
    {
      id: 'definition',
      title: '定义',
      intro: '软组织肉瘤不是一种病，而是一组起源于间叶组织（脂肪、肌肉、纤维、血管、神经鞘等）的恶性肿瘤的统称。'
        + '本页数据为脚手架示例，用于演示四段结构与措辞口径，不可作为临床依据。',
      points: [
        '世界卫生组织（WHO）《软组织与骨肿瘤分类》第 5 版（2020）按分化方向分类：脂肪细胞性、成纤维细胞性与肌纤维母细胞性、血管性与周细胞性、平滑肌、骨骼肌、胃肠道间质、神经鞘、未确定分化等。',
        '同一部位、同一大小的两个肉瘤，可能是完全不同的两种病——分类看的是病理亚型，不是长在哪里。',
        '常见首发部位是肢体（大腿最常见），其次躯干与腹膜后、头颈。部位本身不决定分期。'
      ],
      sources: [
        { org: 'WHO', doc: 'Classification of Tumours: Soft Tissue and Bone Tumours, 5th ed.', version: '2020', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: '页码待核' }
      ]
    },
    {
      id: 'evidence',
      title: '医学资料规范和指南情况',
      intro: '这个工作台里出现的每一条「该查什么、该怎么分期」，都应能追到下面某一份文件。'
        + '原件未取得的，在表里如实标出来，不假装看过。',
      table: {
        head: ['机构', '文件', '版本 / 年份', '原件', '本台的用途'],
        rows: [
          ['NCCN', 'Soft Tissue Sarcoma（NCCN Guidelines）', 'V3.2026（2026-03-12 生效）',
            { text: '已取得：NCCN 患者版 PDF（示例）', kind: 'pdf', url: 'https://example.org/guideline.pdf' },
            '分期检查、治疗路径与随访节奏的出处'],
          ['AJCC', 'Cancer Staging Manual, 8th ed.（STS 章节）', '2017',
            { text: '已取得：官方分期规则 PDF（示例）', kind: 'pdf', url: 'https://example.org/ajcc-rules.pdf' },
            'TNM 与组织学分级（G）如何进入分期组'],
          ['WHO', 'Soft Tissue and Bone Tumours, 5th ed.', '2020',
            { text: '已取得：IARC 出版物页（示例）', kind: 'fulltext', url: 'https://example.org/who-classification' },
            '病理亚型命名的唯一口径'],
          ['CSCO', '骨与软组织肿瘤诊疗指南', '2025 版',
            { text: '未取得原件', nolink: true, note: '示例：无官方免费全文，本台不引用其条文' },
            '国内可及药物与本土实践差异，暂不作引用依据']
        ]
      },
      points: [
        '指南给的是「通常怎么做」，不是「你该怎么做」。版本号必须写清：同一份指南隔一年，条目会变。',
        '本台对未取得原件的文件只记「存在」与「大致讲什么」，不引用其具体条文。'
      ],
      sources: [
        { org: 'NCCN', doc: 'NCCN Guidelines · Soft Tissue Sarcoma', version: 'V3.2026', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: 'P12–P18' },
        { org: 'AJCC', doc: 'AJCC Cancer Staging Manual, 8th ed.', version: '2017', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: '页码待核' },
        { org: 'CSCO', doc: '骨与软组织肿瘤诊疗指南', version: '2025 版', original: false, secondaryUrl: "https://example.org/secondary-source", note: '未取得原件，据二次来源' }
      ]
    },
    {
      id: 'landscape',
      title: '目前治疗全景概要',
      intro: '下面按期别与线序列出指南里出现过的手段类别。这是「世界上大致有哪些办法」的地图，不是给你排的先后顺序。',
      groups: [
        {
          label: '局限期（可以手术切除时）',
          points: [
            '手术：保肢切除是主流目标；截肢在无法保肢时才被讨论。切缘状态按病理报告原文记录（R0 / R1 / R2）。',
            '放疗：术前、术后、或术中近距离照射，各有适用情形；不同情形的取舍属于医生判断。',
            '化疗：在部分高危情形下被列为可讨论选项；是否使用、用哪种方案，指南没有给出「一刀切」答案。'
          ]
        },
        {
          label: '晚期 / 转移后',
          points: [
            '全身治疗：以蒽环类为基础的化疗是长期存在的选项；后续线序可包含其他化疗药、靶向药与免疫治疗。',
            '局部处理：寡转移灶的放疗或手术，在特定情形下被列出。',
            '临床研究：指南把「参加登记良好的临床试验」列为一项正式选项，而不是最后手段。'
          ]
        }
      ],
      points: [
        '以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。'
      ],
      sources: [
        { org: 'NCCN', doc: 'NCCN Guidelines · Soft Tissue Sarcoma', version: 'V3.2026', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: 'P22–P34' }
      ]
    },
    {
      id: 'trend',
      title: '发展趋势',
      intro: '这一段只写已经发生的事：哪份文件换了版本、哪一天生效、分类体系改了什么、登记平台上多了多少条。'
        + '不写预测，不做评价，也不给任何倾向。',
      points: [
        '2020 年：WHO 第 5 版《软组织与骨肿瘤分类》出版，取代第 4 版（2013），部分亚型被重命名或重新归类。',
        '2026-03-12：NCCN 软组织肉瘤指南由 V2.2026 更新为 V3.2026 并生效。',
        '截至 2026-10：中国药物临床试验登记与信息公示平台可检索到软组织肉瘤相关登记若干条，其中 I 期与 II 期占多数（数字随检索日期变化，检索条件与结果需一并记录）。'
      ],
      sources: [
        { org: 'WHO', doc: 'Soft Tissue and Bone Tumours, 5th ed.', version: '2020', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: '页码待核' },
        { org: 'NCCN', doc: 'NCCN Guidelines · Soft Tissue Sarcoma', version: 'V3.2026', original: true, kind: 'pdf', url: "https://example.org/guideline.pdf", page: '更新记录页' }
      ]
    }
  ]
}
