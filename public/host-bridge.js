/* 宿主桥（装机版）：
 *   ① 患者档案：新建 / 切换 / 删除，真实档案记录写入本机 sqlite（demo 仍用前端合成语料）
 *   ② 记录落库：记录变更后防抖整包保存，失败如实 toast，不假装已保存
 *   ③ 资料目录：页内「选择本机目录」走宿主选择器，服务端二次校验主目录/桌面/下载根/tmp
 *   ④ 临床研究：基础档案 → 匹配检查 → 结果分析（含百分数与分母）
 *
 * 这个文件不复制原型的数据模型：只把 state.records / currentDataset 接到服务端。
 * 没连上本机服务时（直接打开 public/index.html）保持原型的原型预览行为。
 */
'use strict'

const HB_API = '/api/behcet/api'
const HB = {
  connected: false,
  profiles: [],
  active: null,
  activeKey: null,
  dataRoot: '',
  lastSaved: '',
  saving: false,
  trialProfileLoaded: false,
  trialProfile: null,
  saved: [],
  pool: null,
  match: null,
  filters: { keyword: '', status: '', studyType: '' },
  busy: false,
  keepViewOnce: false,
}

function hbJson(url, options) {
  return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (rsp) {
    return rsp.json().catch(function () { return {} }).then(function (body) {
      if (!rsp.ok) throw new Error(body.error || body.detail || ('HTTP ' + rsp.status))
      return body
    })
  })
}

function hbQuery(params) {
  const q = new URLSearchParams()
  Object.keys(params || {}).forEach(function (k) { if (params[k]) q.set(k, params[k]) })
  const s = q.toString()
  return s ? '?' + s : ''
}

function hbProfileKey() { return HB.active ? HB.active.profileKey : '' }

/* ---------------- 样式（只补新组件，不改原型） ---------------- */

function hbInstallStyles() {
  if (document.getElementById('hb-style')) return
  const style = document.createElement('style')
  style.id = 'hb-style'
  style.textContent = [
    '.tc-score{display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:96px;padding:10px 8px;border-radius:14px;background:#edf7f1;flex:0 0 auto}',
    '.tc-score .num{font-size:26px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}',
    '.tc-score .muted{font-size:11px;margin-top:4px}',
    '.trial-card.hard{background:#fdf3f0;border-color:#e8cfc6}',
    '.trial-card summary{list-style:none}',
    '.trial-card summary::-webkit-details-marker{display:none}',
    '.tc-state{display:inline-flex;width:24px;height:24px;border-radius:999px;align-items:center;justify-content:center;font-weight:700;background:#eef2ef}',
    '.tc-state.match{background:#dff3e6;color:#1c6b42}',
    '.tc-state.mismatch{background:#fbe1da;color:#9a2f16}',
    '.tc-state.unknown{background:#fdf1cf;color:#7a5a10}',
    '.table{width:100%;border-collapse:collapse}',
    '.table th,.table td{border-top:1px solid var(--line);padding:8px;text-align:left;vertical-align:top;font-size:14px}',
    '.table th{background:#f8fbf9;font-size:12.5px;color:#596c62}',
  ].join('\n')
  document.head.appendChild(style)
}

/* ---------------- 初始化 ---------------- */

function hbBoot() {
  hbInstallStyles()
  hbJson(HB_API + '/bootstrap').then(function (boot) {
    HB.connected = true
    HB.dataRoot = boot.dataRoot || ''
    HB.profiles = Array.isArray(boot.profiles) ? boot.profiles : []
    HB.version = boot.version || ''
    HB.snapshot = boot.trialSnapshot || null
    let wanted = ''
    try { wanted = localStorage.getItem('behcet.activeProfile') || '' } catch (e) { /* 隐私模式 */ }
    let active = HB.profiles.find(function (p) { return p.profileKey === wanted }) ||
      HB.profiles.find(function (p) { return !p.isDemo }) ||
      HB.profiles[0] || null
    if (!active) {
      hbInstallHeader()
      hbUpdateHeader()
      hbAfterRender()
      return
    }
    hbSwitchProfile(active.profileKey, { first: true })
  }).catch(function () {
    HB.connected = false
    hbInstallHeader()
    hbUpdateHeader()
    hbAfterRender()
  })
}

/* 页面（index.html）里的「档案管理」弹窗需要读 profiles；这里只暴露同一个对象引用，不复制状态。 */
window.__BEIPAL_HB__ = HB

function hbSwitchProfile(key, opts) {
  const profile = HB.profiles.find(function (p) { return p.profileKey === key })
  if (!profile) return Promise.resolve()
  const prevView = state.view
  const prevSub = state.sub
  HB.busy = true
  return hbLoadRecords(profile).then(function (records) {
    let set
    if (profile.isDemo) {
      const datasetId = key === 'b' ? 'courseB' : 'courseA'
      set = DATASETS.find(function (d) { return d.id === datasetId }) || DATASETS[0]
    } else {
      set = { id: 'live-' + key, label: profile.name, synthetic: false, records: records, metrics: [], events: [] }
    }
    if (!set) throw new Error('没有可用的示例数据')
    HB.active = profile
    HB.activeKey = key
    try { localStorage.setItem('behcet.activeProfile', key) } catch (e) { /* 隐私模式 */ }
    currentDataset = set
    metrics = buildMetricsFor(set)
    events = set.events || []
    state = initialState(set)
    HB.lastSaved = profile.isDemo ? '' : JSON.stringify(state.records)
    HB.trialProfileLoaded = false
    HB.trialProfile = null
    HB.saved = []
    HB.pool = null
    HB.match = null
    hbInstallHeader()
    hbUpdateHeader()
    hbLoadTrialProfile().then(function () {
      if (state.view === '临床研究') render()
    })
    const keepView = HB.keepViewOnce
    HB.keepViewOnce = false
    if (keepView && prevView) {
      state.view = prevView
      state.sub = prevSub
      render()
    } else go('看板')
    if (!opts || !opts.first) {
      toast(profile.isDemo ? ('已切到演示档案「' + profile.name + '」（合成数据，不会写入资料库）') :
        ('已切到「' + profile.name + '」，记录写入本机资料库'))
    }
  }).catch(function (error) {
    toast('切换档案失败：' + String(error && error.message || error))
  }).then(function () { HB.busy = false })
}

function hbLoadRecords(profile) {
  if (profile.isDemo) return Promise.resolve([])
  return hbJson(HB_API + '/subjects/' + encodeURIComponent(profile.profileKey) + '/records')
    .then(function (data) { return Array.isArray(data.records) ? data.records : [] })
}

/* ---------------- 顶栏 ---------------- */

function hbInstallHeader() {
  if (document.getElementById('profile-switch')) return
  const header = document.querySelector('.top')
  if (!header) return
  const status = header.querySelector('.status')
  const group = document.getElementById('group-switch')
  const profileBtn = document.createElement('button')
  profileBtn.id = 'profile-switch'
  profileBtn.type = 'button'
  profileBtn.className = 'group-switch'
  profileBtn.setAttribute('aria-haspopup', 'dialog')
  profileBtn.setAttribute('aria-label', '切换患者档案')
  profileBtn.innerHTML = '<span class="gs-dot" aria-hidden="true"></span><span id="profile-switch-text">档案</span><span aria-hidden="true">▾</span>'
  profileBtn.addEventListener('click', hbOpenProfiles)
  const newBtn = document.createElement('button')
  newBtn.id = 'profile-new'
  newBtn.type = 'button'
  newBtn.textContent = '＋ 新建患者'
  newBtn.addEventListener('click', hbNewProfileForm)
  if (group) {
    group.hidden = true
    group.style.display = 'none'
    group.insertAdjacentElement('afterend', profileBtn)
    profileBtn.insertAdjacentElement('afterend', newBtn)
  } else if (status) {
    status.insertAdjacentElement('beforebegin', profileBtn)
    profileBtn.insertAdjacentElement('afterend', newBtn)
  }
}

function hbUpdateHeader() {
  const btn = document.getElementById('profile-switch-text')
  if (btn) {
    const name = HB.active ? HB.active.name : '档案'
    btn.textContent = name.length > 14 ? name.slice(0, 13) + '…' : name
  }
  const version = document.querySelector('.top .version')
  if (version && HB.connected && HB.version) version.textContent = 'v' + HB.version
  const status = document.querySelector('.top .status')
  if (!status) return
  if (!HB.connected) {
    status.textContent = '原型预览 · 未连接本机资料库 · 刷新后重置'
    status.title = '未检测到本机服务；装进 DSH Desktop 后才可新建患者与保存记录。'
    return
  }
  if (!HB.active) {
    status.textContent = '本机资料库 · 还没有档案'
    return
  }
  if (HB.active.isDemo) {
    status.textContent = '合成示例 · ' + HB.active.name + ' · 刷新后重置'
    status.title = '演示档案；新建自己的档案后会写入本机 sqlite。'
  } else {
    status.textContent = '本机资料库 · ' + HB.active.name + ' · 已连接'
    status.title = '数据目录：' + HB.dataRoot
  }
}

/* ---------------- 档案对话框 ---------------- */

function hbOpenProfiles() {
  if (!HB.connected) {
    dialog('患者档案', '<p class="notice">原型预览没有本机服务：新建患者需要装进 DSH Desktop 后在面板里使用。</p>', '<button data-action="cancel">关闭</button>')
    return
  }
  const rows = HB.profiles.map(function (p) {
    const current = p.profileKey === HB.activeKey
    return '<div class="row"><div class="spread"><div><h3>' + esc(p.name) + (p.isDemo ? ' <span class="tag">演示</span>' : ' <span class="tag">我的档案</span>') + '</h3>' +
      '<p class="muted">' + esc(p.meta || '') + '</p></div>' +
      '<div class="actions"><button data-profile-switch="' + esc(p.profileKey) + '" aria-pressed="' + current + '">' + (current ? '当前' : '切换') + '</button>' +
      (p.isDemo ? '' : '<button data-profile-delete="' + esc(p.profileKey) + '">删除</button>') + '</div></div></div>'
  }).join('')
  dialog('患者档案', '<p class="muted">演示档案是合成数据，不会写入资料库；新建档案从空记录开始，记录写入本机 sqlite。</p>' +
    '<div class="list">' + rows + '</div>' +
    '<div class="actions"><button class="primary" data-profile-new>＋ 新建患者</button></div>' +
    '<p class="muted">资料目录：' + esc(HB.dataRoot || '未配置') + '</p>',
    '<button data-action="cancel">关闭</button>')
}

function hbNewProfileForm() {
  dialog('新建患者档案',
    '<p class="muted">只填名字（可以是昵称）；演示档案不会被改动，新档案从空记录开始。</p>' +
    '<label class="field">档案名<input id="new-profile-name" maxlength="40" placeholder="例：我自己 / 妈妈"></label>' +
    '<label class="field">第二行说明（可选）<input id="new-profile-meta" maxlength="40" placeholder="例：确诊 2025-03 · 随访中"></label>' +
    '<p id="new-profile-err" class="notice" hidden></p>',
    '<button data-action="cancel">取消</button><button class="primary" data-profile-create>保存并切换</button>')
}

function hbCreateProfile() {
  const nameEl = document.getElementById('new-profile-name')
  const metaEl = document.getElementById('new-profile-meta')
  const errEl = document.getElementById('new-profile-err')
  const name = nameEl ? nameEl.value.trim() : ''
  if (!name) { if (errEl) { errEl.hidden = false; errEl.textContent = '请填写档案名。' } return }
  if (!HB.connected) { if (errEl) { errEl.hidden = false; errEl.textContent = '没有连接本机服务，无法新建。' } return }
  hbJson(HB_API + '/subjects', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: name, meta: metaEl ? metaEl.value.trim() : '' }),
  }).then(function (made) {
    return hbJson(HB_API + '/bootstrap').then(function (boot) {
      HB.profiles = boot.profiles || []
      HB.dataRoot = boot.dataRoot || HB.dataRoot
      const closeBtn = document.querySelector('#dialog button[data-action="cancel"]')
      if (closeBtn) closeBtn.click()
      return hbSwitchProfile(made.profileKey)
    })
  }).catch(function (error) {
    if (errEl) { errEl.hidden = false; errEl.textContent = '新建失败：' + String(error && error.message || error) }
  })
}

function hbDeleteProfile(key) {
  const profile = HB.profiles.find(function (p) { return p.profileKey === key })
  if (!profile) return
  dialog('删除档案', '<p>删除 <strong>' + esc(profile.name) + '</strong>？该档案的记录会一并删除，无法恢复。</p><p class="muted">演示档案不会出现在这个入口。</p>',
    '<button data-action="cancel">取消</button><button class="primary" data-profile-delete-confirm="' + esc(key) + '">确认删除</button>')
}

function hbDeleteProfileConfirmed(key) {
  hbJson(HB_API + '/subjects?profileKey=' + encodeURIComponent(key), { method: 'DELETE' }).then(function () {
    return hbJson(HB_API + '/bootstrap').then(function (boot) {
      HB.profiles = boot.profiles || []
      const closeBtn = document.querySelector('#dialog button[data-action="cancel"]')
      if (closeBtn) closeBtn.click()
      const next = HB.profiles.find(function (p) { return !p.isDemo }) || HB.profiles[0]
      if (HB.activeKey === key) {
        HB.active = null
        HB.activeKey = null
      }
      if (next) return hbSwitchProfile(next.profileKey)
      go('看板')
      toast('已删除；当前没有档案')
    })
  }).catch(function (error) { toast('删除失败：' + String(error && error.message || error)) })
}

/* ---------------- 记录落库 ---------------- */

let hbSaveTimer = null
function hbScheduleSave() {
  if (!HB.connected || !HB.active || HB.active.isDemo) return
  clearTimeout(hbSaveTimer)
  hbSaveTimer = setTimeout(hbSaveNow, 450)
}

function hbSaveNow() {
  if (!HB.connected || !HB.active || HB.active.isDemo || HB.saving) return
  let json = ''
  try { json = JSON.stringify(state.records) } catch (e) { return }
  if (json === HB.lastSaved) return
  HB.saving = true
  hbJson(HB_API + '/subjects/' + encodeURIComponent(HB.activeKey) + '/records', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ records: state.records }),
  }).then(function () {
    HB.lastSaved = json
    toast('已保存到本机资料库（' + state.records.length + ' 条记录）')
  }).catch(function (error) {
    toast('保存失败：' + String(error && error.message || error) + '。记录仍在本页，别刷新。')
  }).then(function () { HB.saving = false })
}

/* ---------------- 临床研究 ---------------- */

function hbTrialTab() {
  const sub = state.sub
  return (sub === '匹配检查' || sub === '结果分析') ? sub : '基础档案'
}

function hbLoadTrialProfile() {
  const key = hbProfileKey()
  if (!HB.connected || !key) { HB.trialProfileLoaded = true; return Promise.resolve() }
  return Promise.all([
    hbJson(HB_API + '/trial-profile?profileKey=' + encodeURIComponent(key)),
    hbJson(HB_API + '/saved-trials?profileKey=' + encodeURIComponent(key)),
  ]).then(function (out) {
    HB.trialProfile = out[0].profile || null
    HB.saved = out[1].records || []
    HB.trialProfileLoaded = true
  }).catch(function (error) {
    HB.trialProfileLoaded = true
    toast('读取试验档案失败：' + String(error && error.message || error))
  })
}

function hbLoadPool() {
  if (!HB.connected) return Promise.resolve()
  return hbJson(HB_API + '/trials' + hbQuery(HB.filters)).then(function (data) {
    HB.pool = data
  }).catch(function (error) {
    HB.pool = { available: false, reason: String(error && error.message || error), records: [] }
  })
}

function hbLoadMatch() {
  if (!HB.connected || !HB.active) return Promise.resolve()
  return hbJson(HB_API + '/trials/match' + hbQuery({ profileKey: HB.activeKey, keyword: HB.filters.keyword })).then(function (data) {
    HB.match = data
  }).catch(function (error) {
    HB.match = { available: false, reason: String(error && error.message || error), results: [] }
  })
}

function hbSaveTrialProfileFromForm() {
  const ageEl = document.getElementById('tp-age')
  const sexEl = document.getElementById('tp-sex')
  const diagEl = document.getElementById('tp-diagnosis')
  const pregEl = document.getElementById('tp-pregnant')
  const medsEl = document.getElementById('tp-meds')
  const organs = Array.prototype.slice.call(document.querySelectorAll('[data-tp-organ]:checked')).map(function (el) { return el.value })
  const meds = medsEl ? medsEl.value.split(/[、,，;；\n]/).map(function (s) { return s.trim() }).filter(Boolean) : []
  const payload = {
    age: ageEl && ageEl.value !== '' ? Number(ageEl.value) : null,
    sex: sexEl ? sexEl.value : '',
    diagnosisConfirmed: diagEl ? (diagEl.value === 'yes' ? true : diagEl.value === 'no' ? false : null) : null,
    organs: organs,
    meds: meds,
    pregnant: pregEl ? pregEl.value : '',
  }
  if (!HB.active || !HB.connected) { toast('没有连接本机服务'); return }
  hbJson(HB_API + '/trial-profile?profileKey=' + encodeURIComponent(HB.activeKey), {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }).then(function (out) {
    HB.trialProfile = out.profile
    toast('基础档案已保存；只有你填写的字段参与匹配')
    HB.match = null
    go('临床研究', '匹配检查')
  }).catch(function (error) { toast('保存失败：' + String(error && error.message || error)) })
}

function hbStartMatch() {
  HB.busy = true
  render()
  hbLoadMatch().then(function () { HB.busy = false; render() })
}

function hbSaveTrial(id) {
  const rec = (HB.match && HB.match.results || []).find(function (r) { return r.recordId === id }) ||
    (HB.pool && HB.pool.records || []).find(function (r) { return r.recordId === id })
  if (!rec) return
  hbJson(HB_API + '/saved-trials?profileKey=' + encodeURIComponent(HB.activeKey), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      recordId: rec.recordId, title: rec.title, studyType: rec.studyType,
      status: rec.status, phase: rec.phase, sourceUrl: rec.sourceUrl, snapshotDate: rec.snapshotDate,
    }),
  }).then(function (out) {
    HB.saved = out.records || []
    toast('已收藏为线索：' + id + '（零副作用）')
    render()
  }).catch(function (error) { toast('收藏失败：' + String(error && error.message || error)) })
}

function hbRemoveSaved(id) {
  hbJson(HB_API + '/saved-trials?profileKey=' + encodeURIComponent(HB.activeKey) + '&recordId=' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function (out) { HB.saved = out.records || []; render() })
    .catch(function (error) { toast('移除失败：' + String(error && error.message || error)) })
}

function hbTrialTabButtons() {
  const tab = hbTrialTab()
  return ['基础档案', '匹配检查', '结果分析'].map(function (name) {
    return '<button data-trial-tab="' + name + '" aria-selected="' + (name === tab) + '">' + name + '</button>'
  }).join('')
}

function hbTrialFrame(inner) {
  return '<div class="eyebrow">临床研究 · 35 号四段链路</div><h1>临床试验</h1>' +
    '<p class="muted">这里给的是<b>带证据链的检索线索 + 登记字段符合度</b>，不是入组资格结论；判定归医生与研究中心。</p>' +
    '<div class="tabs" role="tablist" aria-label="临床试验三步">' + hbTrialTabButtons() + '</div>' + inner
}

function hbBaseTab() {
  const p = HB.trialProfile || {}
  const organs = p.organs || []
  const organList = ['口腔', '生殖器', '皮肤', '眼', '关节', '血管', '神经', '消化道']
  const sexSel = function (v, label) { return '<option value="' + v + '"' + (p.sex === v ? ' selected' : '') + '>' + label + '</option>' }
  const diagSel = function (v, label) { return '<option value="' + v + '"' + ((p.diagnosisConfirmed === true && v === 'yes') || (p.diagnosisConfirmed === false && v === 'no') || (p.diagnosisConfirmed == null && v === '') ? ' selected' : '') + '>' + label + '</option>' }
  return '<div class="card"><h2>基础档案</h2>' +
    '<p class="muted">只有你在这里明确填写并保存的字段参与匹配；没填 = 待确认，不按「符合」计。药物靶点不参与打分。</p>' +
    '<div class="grid">' +
    '<label class="field">年龄<input id="tp-age" type="number" min="0" max="120" value="' + (p.age != null ? esc(p.age) : '') + '" placeholder="例：38"></label>' +
    '<label class="field">性别<select id="tp-sex"><option value="">未填写</option>' + sexSel('female', '女') + sexSel('male', '男') + '</select></label>' +
    '<label class="field">白塞病诊断<select id="tp-diagnosis"><option value="">未填写</option>' + diagSel('yes', '已确诊（有医生诊断）') + diagSel('no', '未确诊') + '</select></label>' +
    '<label class="field">妊娠/哺乳<select id="tp-pregnant"><option value="">未填写</option><option value="no"' + (p.pregnant === 'no' ? ' selected' : '') + '>否</option><option value="yes"' + (p.pregnant === 'yes' ? ' selected' : '') + '>是</option></select></label>' +
    '</div>' +
    '<fieldset class="field" style="border:0;padding:0"><legend>已记录受累部位（可多选）</legend><div class="actions">' +
    organList.map(function (name) {
      return '<label><input type="checkbox" data-tp-organ value="' + name + '"' + (organs.indexOf(name) >= 0 ? ' checked' : '') + '> ' + name + '</label>'
    }).join('') + '</div></fieldset>' +
    '<label class="field">当前/既往用药（用顿号或逗号分隔）<input id="tp-meds" value="' + esc((p.meds || []).join('、')) + '" placeholder="例：阿达木单抗、秋水仙碱"></label>' +
    '<p class="muted">未填的字段在匹配里显示「待确认」；不会用阴性或符合去补。</p>' +
    '<div class="actions"><button class="primary" data-trial-action="save-profile">保存基础档案</button>' +
    '<button data-trial-tab="匹配检查">下一步：匹配检查 →</button></div></div>'
}

function hbPoolHeader() {
  const pool = HB.pool
  if (!pool || !pool.candidatePool) return ''
  const cp = pool.candidatePool
  return '<div class="notice"><b>候选池口径</b>：本地快照已载 ' + cp.loaded + ' 条 · 本次条件命中 ' + cp.matched + ' 条 · 返回 ' + cp.returned + ' 条（最多 ' + cp.limit + '）。' +
    '不是全库扫描；登记状态未核实，不等于正在招募。</div>'
}

function hbPhase(r) {
  const phase = String(r.phase || '').trim()
  if (!phase || /^NA$/i.test(phase)) return r.isRegistry ? '期别不适用' : '期别未标注'
  return phase
}

function hbTrialListCard(r) {
  const type = r.isRegistry ? '登记/观察研究' : (r.studyType === 'INTERVENTIONAL' ? '干预性研究' : (r.studyType || '未知类型'))
  const place = r.chinaSites ? ('中国中心 ' + r.chinaSites + ' 个') : ((r.countries || []).slice(0, 2).join(' / ') || '地点未知')
  return '<div class="card" style="margin-bottom:10px"><div class="spread"><div><h3>' + esc(r.title) + '</h3>' +
    '<p class="muted">' + esc(r.recordId) + ' · ' + esc(hbPhase(r)) + ' · ' + esc(r.status || '状态未知') + ' · ' + esc(r.leadSponsor || '申办方未知') + ' · ' + esc(place) + '</p></div>' +
    '<span class="tag">' + esc(type) + '</span></div>' +
    '<p class="muted">来源：ClinicalTrials.gov · 快照 ' + esc(r.snapshotDate || '') + ' · 登记状态，未核实</p>' +
    '<a class="link" href="' + esc(r.sourceUrl || '#') + '" target="_blank" rel="noopener noreferrer">官方登记页 ↗</a></div>'
}

function hbMatchTab() {
  const pool = HB.pool
  const f = HB.filters
  let inner = '<div class="card"><h2>匹配检查</h2>' +
    '<p class="muted">先按关键词/状态/研究类型缩小候选；这一步不产生分数，只回答「我要找哪一类登记」。</p>' +
    '<div class="grid">' +
    '<label class="field">关键词<input id="tr-keyword" value="' + esc(f.keyword) + '" placeholder="药名 / 位点 / NCT 号"></label>' +
    '<label class="field">状态<select id="tr-status"><option value="">全部状态</option>' +
    (pool && pool.candidatePool ? pool.candidatePool.statuses.map(function (s) { return '<option value="' + esc(s) + '"' + (f.status === s ? ' selected' : '') + '>' + esc(s) + '</option>' }).join('') : '') + '</select></label>' +
    '<label class="field">研究类型<select id="tr-type"><option value="">全部类型</option>' +
    (pool && pool.candidatePool ? pool.candidatePool.studyTypes.map(function (s) { return '<option value="' + esc(s) + '"' + (f.studyType === s ? ' selected' : '') + '>' + (s === 'INTERVENTIONAL' ? '干预性研究' : s === 'OBSERVATIONAL' ? '登记/观察研究' : esc(s)) + '</option>' }).join('') : '') + '</select></label>' +
    '</div><div class="actions"><button class="primary" data-trial-action="search">检索</button>' +
    '<button data-trial-tab="结果分析">下一步：结果分析 →</button></div></div>'
  if (HB.busy) return inner + '<div class="empty">正在读取本机快照…</div>'
  if (!pool) { inner += '<div class="empty">还没有读取快照。<button data-trial-action="search">读取并检索</button></div>'; return inner }
  if (!pool.available) return inner + '<div class="notice" role="alert">快照不可用：' + esc(pool.reason || '未知原因') + '</div>'
  inner += hbPoolHeader()
  if (!pool.records.length) return inner + '<div class="empty">当前条件没有候选。可以放宽关键词或状态。</div>'
  inner += '<p class="muted">命中 ' + pool.records.length + ' 条；评分在「结果分析」里按你的基础档案算。</p>'
  inner += pool.records.map(hbTrialListCard).join('')
  return inner
}

function hbCriteriaRows(r) {
  return r.criteria.map(function (c) {
    const icon = c.state === 'match' ? '✓' : c.state === 'mismatch' ? '✕' : '?'
    const label = c.state === 'match' ? '符合' : c.state === 'mismatch' ? '不符合' : '待确认'
    return '<tr><td><span class="tc-state ' + c.state + '" aria-label="' + label + '">' + icon + '</span></td>' +
      '<td><b>' + esc(c.label) + '</b>' + (c.hard ? ' <span class="tag">硬性</span>' : '') + (c.needsReview ? ' <span class="tag">需核对原文</span>' : '') + '</td>' +
      '<td>记录里是：' + esc(c.record) + '<br>条件要求：' + esc(c.requirement) +
      (c.evidence ? '<br><span class="muted">原文：' + esc(c.evidence) + '</span>' : '') + '</td></tr>'
  }).join('')
}

function hbTrialResultCard(r) {
  const pct = r.pct == null ? '—' : r.pct + '%'
  const den = r.denominator ? (r.matched + ' / ' + r.denominator + ' 项对得上 · ' + r.unknown + ' 项待确认') : ('0 项可对照 · ' + r.unknown + ' 项待确认')
  const saved = HB.saved.some(function (s) { return s.recordId === r.recordId })
  return '<details class="card trial-card' + (r.hardExcluded ? ' hard' : '') + '" style="margin-bottom:12px">' +
    '<summary style="cursor:pointer;display:flex;gap:14px;align-items:flex-start">' +
    '<span class="tc-score"><b class="num">' + esc(pct) + '</b><span class="muted">登记字段符合度</span></span>' +
    '<span style="flex:1;min-width:0"><b>' + esc(r.title) + '</b>' +
    '<br><small class="muted">' + esc(r.recordId) + ' · ' + esc(hbPhase(r)) + ' · ' + esc(r.status || '状态未知') + ' · ' + (r.isRegistry ? '登记/观察研究' : '干预性研究') + '</small>' +
    '<br><small><b>' + den + '</b> · ' + esc(r.band) + '</small></span>' +
    '</summary>' +
    '<div style="margin-top:12px"><p class="notice" role="note">' + esc(r.declaration) + ' 登记状态，未核实。</p>' +
    '<table class="table"><thead><tr><th>判断</th><th>判据</th><th>记录 / 条件 / 原文</th></tr></thead><tbody>' + hbCriteriaRows(r) + '</tbody></table>' +
    (r.targetNote ? '<p class="muted">' + esc(r.targetNote) + '</p>' : '') +
    '<p class="muted">快照 ' + esc(r.snapshotDate || '') + '；本机快照只存登记的结构化字段与入排原文，最终以官方登记页为准。</p>' +
    '<div class="actions"><a class="link" href="' + esc(r.sourceUrl || '#') + '" target="_blank" rel="noopener noreferrer">官方登记页 ↗</a>' +
    (saved ? '<button data-trial-unsave="' + esc(r.recordId) + '">取消收藏</button>' : '<button data-trial-save="' + esc(r.recordId) + '">收藏为线索</button>') +
    '</div></div></details>'
}

function hbResultsTab() {
  let inner = '<div class="card"><h2>结果分析</h2>' +
    '<p class="muted">分数是「符合项 ÷ 已对照项」；待确认不计入分母，所以只会偏低、不会偏高。可对照项少于 2 条不给数字。</p>'
  if (!HB.profileHasMatchData()) {
    inner += '<div class="notice">基础档案还没有可参与匹配的字段。先去「基础档案」填写年龄、诊断、受累部位或用药。</div><div class="actions"><button data-trial-tab="基础档案">去填基础档案</button></div></div>'
  } else {
    inner += '<div class="actions"><button class="primary" data-trial-action="run-match">' + (HB.match ? '重新计算匹配' : '开始匹配') + '</button>' +
      '<button data-trial-tab="匹配检查">回匹配检查</button></div></div>'
  }
  if (HB.busy) return inner + '<div class="empty">正在计算…</div>'
  if (!HB.match) return inner + '<div class="empty">还没有计算结果。点「开始匹配」。</div>' + hbSavedSection()
  if (!HB.match.available) return inner + '<div class="notice" role="alert">匹配不可用：' + esc(HB.match.reason || '未知原因') + '</div>'
  const dist = HB.match.distribution || {}
  inner += '<div class="card"><h2>分层结果</h2><div class="actions">' +
    ['字段都对得上', '部分对得上', '需补充信息', '硬性条件不满足'].map(function (band) {
      return '<span class="tag">' + band + ' · ' + (dist[band] || 0) + '</span>'
    }).join('') + '</div>' +
    '<p class="muted">共 ' + HB.match.results.length + ' 条候选；硬性条件不满足单列在后，不参与首位排序。</p>' +
    '<p class="muted">' + esc(HB.match.declaration) + '</p></div>'
  inner += HB.match.results.map(hbTrialResultCard).join('')
  inner += hbSavedSection()
  return inner
}

function hbSavedSection() {
  return '<div class="card" style="margin-top:16px"><h2>收藏与跟踪（' + HB.saved.length + '）</h2>' +
    '<p class="muted">收藏只存本机 {登记号, 标题, 状态, 收藏时间}；快照没有登记状态变化时间线，不画假进度条。</p>' +
    (HB.saved.length ? '<div class="list">' + HB.saved.map(function (s) {
      return '<div class="row"><div class="spread"><div><h3>' + esc(s.title || s.recordId) + '</h3>' +
        '<p class="muted">' + esc(s.recordId) + ' · 收藏于 ' + esc(s.savedAt || '') + ' · 快照 ' + esc(s.snapshotDate || '') + '</p></div>' +
        '<div class="actions"><a class="link" href="' + esc(s.sourceUrl || '#') + '" target="_blank" rel="noopener noreferrer">登记页 ↗</a>' +
        '<button data-trial-unsave="' + esc(s.recordId) + '">移除</button></div></div></div>'
    }).join('') + '</div>' : '<div class="empty">还没有收藏。展开结果卡，点「收藏为线索」。</div>') + '</div>'
}

function trialsPage() {
  if (!HB.connected) {
    return '<div class="eyebrow">临床研究</div><h1>临床试验</h1>' +
      '<div class="notice" role="alert">原型预览没有本机服务：临床试验需要装进 DSH Desktop 后使用。' +
      '装好后本页从 <code>research/behcet</code> 快照读取真实登记，并按你的基础档案算登记字段符合度。</div>'
  }
  if (!HB.trialProfileLoaded) {
    hbLoadTrialProfile().then(function () { render() })
    return '<div class="eyebrow">临床研究</div><h1>临床试验</h1><div class="empty">正在读取本机档案…</div>'
  }
  const tab = hbTrialTab()
  let inner
  if (tab === '匹配检查') {
    if (!HB.pool && !HB.busy) {
      HB.busy = true
      hbLoadPool().then(function () { HB.busy = false; render() })
      inner = '<div class="empty">正在读取本地快照…</div>'
    } else {
      inner = hbMatchTab()
    }
  } else if (tab === '结果分析') {
    inner = hbResultsTab()
  } else {
    inner = hbBaseTab()
  }
  return hbTrialFrame(inner)
}

/* 结果分析是否有可匹配字段（与后端 profileFilled 同口径） */
HB.profileHasMatchData = function () {
  const p = HB.trialProfile
  if (!p) return false
  return p.age != null || p.sex != null || p.diagnosisConfirmed != null || (p.organs && p.organs.length > 0) ||
    (p.meds && p.meds.length > 0) || p.pregnant != null
}

/* ---------------- 资料目录 ---------------- */

function hbDirCard() {
  const note = HB.dirNote || ''
  return '<div class="card" id="hb-dir-card" style="margin-bottom:16px"><h2>本机资料目录</h2>' +
    '<p>当前目录：<b id="hb-dir-path">' + esc(HB.dataRoot || '未配置') + '</b></p>' +
    '<p class="muted">资料写入本机 sqlite。主目录本身 / 桌面 / 下载根目录 / tmp 不能作为资料目录；请在里面新建专用文件夹。</p>' +
    '<div class="actions"><button class="primary" data-dir-pick>选择本机目录</button></div>' +
    '<p id="hb-dir-note" class="muted" role="status">' + esc(note) + '</p></div>'
}

function hbPickDirectory() {
  HB.dirNote = ''
  if (window.parent === window) {
    HB.dirNote = '当前页面不是工作台面板：本机目录选择需要在 DSH Desktop 面板里使用。'
    hbRefreshDirCard()
    return
  }
  window.parent.postMessage({ type: 'behcet:pick-directory' }, window.location.origin)
  HB.dirNote = '已请求系统目录选择器…'
  hbRefreshDirCard()
}

function hbOnHostMessage(event) {
  if (event.origin !== window.location.origin) return
  const data = event.data || {}
  if (data.type === 'behcet:root-changed') {
    HB.dataRoot = data.dir || HB.dataRoot
    HB.active = null
    HB.activeKey = null
    HB.pool = null
    HB.match = null
    HB.keepViewOnce = true
    hbBoot()
    return
  }
  if (data.type !== 'behcet:directory-result') return
  if (data.ok && data.dir) {
    HB.dataRoot = data.dir
    HB.dirNote = '资料目录已切换：' + data.dir + '（旧目录数据不会自动搬迁）'
  } else {
    HB.dirNote = data.error || '已取消选择；当前资料目录没有更改。'
  }
  hbRefreshDirCard()
}

function hbRefreshDirCard() {
  const path = document.getElementById('hb-dir-path')
  const note = document.getElementById('hb-dir-note')
  if (path) path.textContent = HB.dataRoot || '未配置'
  if (note) note.textContent = HB.dirNote || ''
  const status = document.querySelector('.top .status')
  if (status && HB.connected && HB.active) status.title = '数据目录：' + HB.dataRoot
}

/* ---------------- 渲染后处理与事件 ---------------- */

function hbAfterRender() {
  hbUpdateHeader()
  const main = document.getElementById('main')
  if (!main) return
  if (state.view === '资料目录与云解析' && !document.getElementById('hb-dir-card')) {
    const first = main.firstElementChild
    const wrap = document.createElement('div')
    wrap.innerHTML = hbDirCard()
    main.insertBefore(wrap.firstElementChild, first)
    hbRefreshDirCard()
  }
  if (state.view === '资料目录与云解析') hbRefreshDirCard()
  /* 看板 hero 的两枚静态标签是原型口径；真实档案要改成"本机资料库"，否则会被读成演示。 */
  if (state.view === '看板' && HB.connected && HB.active && !HB.active.isDemo) {
    const tags = document.querySelectorAll('.hero .tag')
    if (tags[0]) tags[0].textContent = '本机资料库 · 真实记录'
    if (tags[1]) tags[1].textContent = '已保存到本机 sqlite'
  }
}

const hbOriginalRender = render
render = function () {
  hbOriginalRender.apply(null, arguments)
  hbAfterRender()
}

window.addEventListener('message', hbOnHostMessage)

document.addEventListener('click', function (event) {
  const t = event.target
  if (!(t instanceof Element)) return
  const switchBtn = t.closest('[data-profile-switch]')
  if (switchBtn) { hbSwitchProfile(switchBtn.getAttribute('data-profile-switch')); return }
  if (t.closest('[data-profile-new]')) { hbNewProfileForm(); return }
  if (t.closest('[data-profile-create]')) { hbCreateProfile(); return }
  const del = t.closest('[data-profile-delete]')
  if (del) { hbDeleteProfile(del.getAttribute('data-profile-delete')); return }
  const delOk = t.closest('[data-profile-delete-confirm]')
  if (delOk) { hbDeleteProfileConfirmed(delOk.getAttribute('data-profile-delete-confirm')); return }

  const tab = t.closest('[data-trial-tab]')
  if (tab) { go('临床研究', tab.getAttribute('data-trial-tab')); return }
  const act = t.closest('[data-trial-action]')
  if (act) {
    const name = act.getAttribute('data-trial-action')
    if (name === 'save-profile') { hbSaveTrialProfileFromForm(); return }
    if (name === 'search') {
      const kw = document.getElementById('tr-keyword')
      const st = document.getElementById('tr-status')
      const ty = document.getElementById('tr-type')
      HB.filters = { keyword: kw ? kw.value.trim() : '', status: st ? st.value : '', studyType: ty ? ty.value : '' }
      HB.busy = true
      render()
      hbLoadPool().then(function () { HB.busy = false; render() })
      return
    }
    if (name === 'run-match') { hbStartMatch(); return }
  }
  const save = t.closest('[data-trial-save]')
  if (save) { hbSaveTrial(save.getAttribute('data-trial-save')); return }
  const unsave = t.closest('[data-trial-unsave]')
  if (unsave) { hbRemoveSaved(unsave.getAttribute('data-trial-unsave')); return }
  if (t.closest('[data-dir-pick]')) { hbPickDirectory(); return }
}, false)

/* 记录变更多在点击保存后发生；延迟一拍再存，避免和原型自己的 render 抢时序。 */
document.addEventListener('click', function () { setTimeout(hbScheduleSave, 80) }, true)
document.addEventListener('change', function () { setTimeout(hbScheduleSave, 80) }, true)

hbBoot()