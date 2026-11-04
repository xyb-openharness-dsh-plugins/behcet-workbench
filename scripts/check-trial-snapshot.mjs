#!/usr/bin/env node
/**
 * 研究快照的**结构检查器**，不是完整性检查器。
 *
 * 它只核对 manifest 声明的文件、哈希、计数，以及 JSONL 与 SQLite 中固定字段的
 * 逐条一致性；另外核对 manifest 自身的 status / exitCode / 关键字段是否自洽：
 * COMPLETE 时 `windowCoverage.covered` 必须为 true、API base 必须是官方地址、
 * `aliases` 必须与 `queries` 一一对应、`integrity.rawFiles` 的核验结果必须通过。
 * 这些检查只对照清单内部字段与采集脚本的固定契约，**不读取** `pages/` 原始响应，
 * 不重算 windowCoverage，不验证别名查询真的发生、分页链、来源状态或来源真实性。
 * 因此 PASS 只表示“这里检查到的结构一致且清单声明的状态是 COMPLETE”，不能
 * 外推为“研究资料完整”。原始证据与来源真实性由采集脚本的
 * `verifySnapshotHashes` 等独立核验负责。manifest 不是 COMPLETE 时，即使结构
 * 一致也返回非零并明确输出未通过。
 *
 * 用法：node scripts/check-trial-snapshot.mjs [快照目录|父目录] [--if-present]
 * 传入快照目录本身（含 manifest.json、JSONL、SQLite）时直接检查该目录。
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const args=process.argv.slice(2), optional=args.includes('--if-present')
const positional=args.filter((arg)=>!arg.startsWith('-'))
const target=resolve(positional[0]||'.'), errors=[]
const completionFailures=[]
const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex')
const fields=[
 ['recordId','record_id',false],['mergedSources','merged_sources',true],['sourceId','source_id',false],
 ['title','title',false],['studyType','study_type',false],['sponsor','sponsors',true],
 ['registryNumbers','registry_numbers',true],['dates','dates',true],['sourceUrl','source_url',false],
 ['retrievedAt','retrieved_at',false],['statusNote','status_note',false],['snapshotDate','snapshot_date',false]
]
const parseJson=(value,label)=>{
 if(value===null||value===undefined) return null
 try{return JSON.parse(value)}catch(error){throw new Error(`${label} is not valid JSON: ${error.message}`)}
}
const equal=isDeepStrictEqual
const isObject=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const isCount=(value)=>Number.isInteger(value)&&value>=0
const manifestStatuses=new Set(['COMPLETE','PARTIAL','INCOMPLETE','FAILED','PENDING'])
const sourceStates=new Set(['SUCCESS','SUCCESS_ZERO','PARTIAL','INCOMPLETE','FAILED','NOT_QUERIED'])
const completeSourceStates=new Set(['SUCCESS','SUCCESS_ZERO'])
// 采集脚本的公开契约；这里只用于核对清单声明，不用于重新采集或验证来源。
const OFFICIAL_API_BASE='https://clinicaltrials.gov/api/v2'
const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_PATTERN=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/

function normaliseApiBase(value) {
 try {
  if(typeof value!=='string'||!/^https?:\/\//.test(value)) return null
  return new URL(value).toString().replace(/\/+$/,'')
 } catch { return null }
}

function parseUtcTimestamp(value) {
 if(typeof value!=='string'||!ISO_TIMESTAMP_PATTERN.test(value)) return null
 const withZone=/(Z|[+-]\d{2}:\d{2})$/.test(value)?value:`${value}Z`
 const parsed=Date.parse(withZone)
 return Number.isFinite(parsed)?parsed:null
}

function addDaysUTC(date, days) {
 if(typeof date!=='string'||!DATE_PATTERN.test(date)) return null
 const parsed=new Date(`${date}T00:00:00.000Z`)
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date) return null
 parsed.setUTCDate(parsed.getUTCDate()+days)
 return parsed.toISOString().slice(0,10)
}

function requireField(dir, object, key, check, expected) {
 if(!isObject(object)||!(key in object)){
  errors.push(`${dir}: manifest missing required field ${key}`)
  return false
 }
 if(!check(object[key])){
  errors.push(`${dir}: manifest field ${key} must be ${expected}`)
  return false
 }
 return true
}

function checkManifestShape(dir, manifest) {
 requireField(dir,manifest,'schemaVersion',(value)=>typeof value==='number','a number')
 requireField(dir,manifest,'kind',(value)=>typeof value==='string'&&value.length>0,'a non-empty string')
 requireField(dir,manifest,'snapshotDate',(value)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'YYYY-MM-DD')
 requireField(dir,manifest,'status',(value)=>manifestStatuses.has(value),'one of COMPLETE/PARTIAL/INCOMPLETE/FAILED/PENDING')
 requireField(dir,manifest,'exitCode',(value)=>Number.isInteger(value),'an integer')
 requireField(dir,manifest,'window',isObject,'an object')
 requireField(dir,manifest,'queries',Array.isArray,'an array')
 requireField(dir,manifest,'sources',Array.isArray,'an array')
 requireField(dir,manifest,'coverage',isObject,'an object')
 requireField(dir,manifest,'api',isObject,'an object')
 requireField(dir,manifest,'counts',isObject,'an object')
 requireField(dir,manifest,'integrity',isObject,'an object')
 requireField(dir,manifest,'files',isObject,'an object')
 requireField(dir,manifest,'errors',Array.isArray,'an array')
 requireField(dir,manifest,'recordCount',isCount,'a non-negative integer')
 requireField(dir,manifest,'dbCount',isCount,'a non-negative integer')
 requireField(dir,manifest,'sourceStatusRows',isCount,'a non-negative integer')

 if(isObject(manifest.counts)){
  for(const key of ['jsonlRecords','dbRecords','sourceStatusRows','queryRows','queryPages','uniqueRecordIds','errors']) {
   requireField(`${dir} counts`,manifest.counts,key,isCount,'a non-negative integer')
  }
 }
}

/** 清单声明的状态必须与退出码、来源/查询状态及自身错误列表自洽。 */
function checkDeclaredStatus(dir, manifest) {
 const status=manifest.status
 if(!manifestStatuses.has(status)) return

 if(Array.isArray(manifest.queries)){
  manifest.queries.forEach((query,index)=>{
   if(!isObject(query)||typeof query.state!=='string'||!sourceStates.has(query.state)){
    errors.push(`${dir}: manifest queries[${index}].state missing or unknown`)
    return
   }
   if(status==='COMPLETE'&&!completeSourceStates.has(query.state)){
    errors.push(`${dir}: manifest claims COMPLETE but query ${query.queryId??index} state is ${query.state}`)
   }
  })
 }
 if(Array.isArray(manifest.sources)){
  let queried=0
  manifest.sources.forEach((source,index)=>{
   if(!isObject(source)||typeof source.state!=='string'||!sourceStates.has(source.state)){
    errors.push(`${dir}: manifest sources[${index}].state missing or unknown`)
    return
   }
   if(source.queried===true) queried+=1
   if(status!=='COMPLETE') return
   if(source.queried===true&&!completeSourceStates.has(source.state)){
    errors.push(`${dir}: manifest claims COMPLETE but queried source ${source.sourceId??index} state is ${source.state}`)
   }
   if(source.queried!==true&&source.state!=='NOT_QUERIED'){
    errors.push(`${dir}: manifest claims COMPLETE but unqueried source ${source.sourceId??index} state is ${source.state}`)
   }
  })
  if(status==='COMPLETE'&&queried===0) errors.push(`${dir}: manifest claims COMPLETE but no source was queried`)
 }

 if(status==='COMPLETE'){
  if(manifest.exitCode!==0) errors.push(`${dir}: manifest claims COMPLETE but exitCode is ${manifest.exitCode}`)
  if(Array.isArray(manifest.errors)&&manifest.errors.length) errors.push(`${dir}: manifest claims COMPLETE but carries ${manifest.errors.length} error(s)`)
  const api=manifest.api
  if(!isObject(api)||api.state!=='OK'||api.afterState!=='OK'){
   errors.push(`${dir}: manifest claims COMPLETE but before/after API state is not OK`)
  }else{
   if(api.collectionStable!==true) errors.push(`${dir}: manifest claims COMPLETE but api.collectionStable is not true`)
   if(api.dataTimestampChanged!==false) errors.push(`${dir}: manifest claims COMPLETE but api.dataTimestampChanged is not false`)
   if(api.apiVersionChanged!==false) errors.push(`${dir}: manifest claims COMPLETE but api.apiVersionChanged is not false`)
  }
  if(manifest.recordCount!==manifest.dbCount) errors.push(`${dir}: manifest recordCount ${manifest.recordCount} != dbCount ${manifest.dbCount}`)
 }else{
  if(manifest.exitCode===0) errors.push(`${dir}: manifest status ${status} must not carry exitCode 0`)
  completionFailures.push({dir,status,exitCode:manifest.exitCode})
 }

 if(isObject(manifest.counts)){
  const pairs=[['jsonlRecords',manifest.recordCount],['dbRecords',manifest.dbCount],['sourceStatusRows',manifest.sourceStatusRows]]
  for(const [key,declared] of pairs){
   if(isCount(manifest.counts[key])&&isCount(declared)&&manifest.counts[key]!==declared){
    errors.push(`${dir}: manifest counts.${key} ${manifest.counts[key]} != ${key==='jsonlRecords'?'recordCount':key==='dbRecords'?'dbCount':'sourceStatusRows'} ${declared}`)
   }
  }
  if(isCount(manifest.counts.jsonlRecords)&&isCount(manifest.counts.dbRecords)&&manifest.counts.jsonlRecords!==manifest.counts.dbRecords){
   errors.push(`${dir}: manifest counts.jsonlRecords ${manifest.counts.jsonlRecords} != counts.dbRecords ${manifest.counts.dbRecords}`)
  }
 }
}

function checkWindowCoverage(dir, manifest) {
 const coverage=manifest.windowCoverage
 if(!isObject(coverage)){
  errors.push(`${dir}: manifest.windowCoverage is missing or not an object`)
  return
 }
 const windowEnd=isObject(manifest.window)&&typeof manifest.window.end==='string'?manifest.window.end:null
 const validEnd=typeof coverage.windowEnd==='string'&&DATE_PATTERN.test(coverage.windowEnd)
 if(!validEnd) errors.push(`${dir}: manifest.windowCoverage.windowEnd must be YYYY-MM-DD`)
 if(validEnd&&windowEnd&&coverage.windowEnd!==windowEnd){
  errors.push(`${dir}: manifest.windowCoverage.windowEnd ${coverage.windowEnd} != manifest.window.end ${windowEnd}`)
 }
 const dayAfter=validEnd?addDaysUTC(coverage.windowEnd,1):null
 if(dayAfter){
  const requiredThrough=`${coverage.windowEnd}T23:59:59.999Z`
  const requiredThroughExclusive=`${dayAfter}T00:00:00.000Z`
  if(coverage.requiredThrough!==requiredThrough){
   errors.push(`${dir}: manifest.windowCoverage.requiredThrough must be ${requiredThrough}`)
  }
  if(coverage.requiredThroughExclusive!==requiredThroughExclusive){
   errors.push(`${dir}: manifest.windowCoverage.requiredThroughExclusive must be ${requiredThroughExclusive}`)
  }
  const requiredMs=Date.parse(requiredThroughExclusive)
  const before=parseUtcTimestamp(coverage.dataTimestamp)
  const after=parseUtcTimestamp(coverage.dataTimestampAfter)
  const beforeValid=before!==null, afterValid=after!==null
  if(coverage.dataTimestampValid!==beforeValid){
   errors.push(`${dir}: manifest.windowCoverage.dataTimestampValid ${JSON.stringify(coverage.dataTimestampValid)} contradicts dataTimestamp ${JSON.stringify(coverage.dataTimestamp)}`)
  }
  if(coverage.dataTimestampAfterValid!==afterValid){
   errors.push(`${dir}: manifest.windowCoverage.dataTimestampAfterValid ${JSON.stringify(coverage.dataTimestampAfterValid)} contradicts dataTimestampAfter ${JSON.stringify(coverage.dataTimestampAfter)}`)
  }
  const covered=beforeValid&&afterValid&&before>=requiredMs&&after>=requiredMs
  if(typeof coverage.covered!=='boolean'){
   errors.push(`${dir}: manifest.windowCoverage.covered must be a boolean`)
  }else if(coverage.covered!==covered){
   errors.push(`${dir}: manifest.windowCoverage.covered is ${coverage.covered} but data timestamps imply ${covered}`)
  }
 }
 if(manifest.status==='COMPLETE'&&coverage.covered!==true){
  errors.push(`${dir}: manifest claims COMPLETE but windowCoverage.covered is not true`)
 }
}

function checkAliasLedger(dir, manifest) {
 const aliases=manifest.aliases
 if(!Array.isArray(aliases)){
  errors.push(`${dir}: manifest.aliases is missing`)
  return
 }
 if(!aliases.length){
  errors.push(`${dir}: manifest.aliases is empty`)
  return
 }
 const seen=new Set()
 aliases.forEach((alias,index)=>{
  if(typeof alias!=='string'||!alias.trim()){
   errors.push(`${dir}: manifest.aliases[${index}] must be a non-empty string`)
   return
  }
  if(seen.has(alias)) errors.push(`${dir}: manifest.aliases contains duplicate ${JSON.stringify(alias)}`)
  seen.add(alias)
 })
 const queries=Array.isArray(manifest.queries)?manifest.queries:[]
 if(aliases.length!==queries.length){
  errors.push(`${dir}: manifest.aliases lists ${aliases.length} aliases but queries has ${queries.length}`)
 }
 const count=Math.min(aliases.length,queries.length)
 for(let index=0;index<count;index+=1){
  const query=queries[index]
  if(!isObject(query)) continue
  if(typeof query.alias!=='string'||!query.alias.trim()){
   errors.push(`${dir}: manifest queries[${index}] has no alias`)
  }else if(query.alias!==aliases[index]){
   errors.push(`${dir}: manifest queries[${index}] alias ${JSON.stringify(query.alias)} != manifest.aliases[${index}] ${JSON.stringify(aliases[index])}`)
  }
 }
}

function checkApiIdentity(dir, manifest) {
 const api=manifest.api
 if(!isObject(api)) return
 if(typeof api.customApiBase!=='boolean'){
  errors.push(`${dir}: manifest.api.customApiBase must be a boolean`)
 }
 const officialBase=normaliseApiBase(OFFICIAL_API_BASE)
 const base=normaliseApiBase(api.baseUrl)
 if(base===null){
  errors.push(`${dir}: manifest.api.baseUrl is missing or not an http(s) URL`)
 }else{
  const official=base===officialBase
  if(api.customApiBase===false&&!official){
   errors.push(`${dir}: manifest.api.customApiBase is false but baseUrl ${JSON.stringify(api.baseUrl)} is not the official ${OFFICIAL_API_BASE}`)
  }
  if(api.customApiBase===true&&official){
   errors.push(`${dir}: manifest.api.customApiBase is true but baseUrl is the official ${OFFICIAL_API_BASE}`)
  }
  if(manifest.status==='COMPLETE'&&!official){
   errors.push(`${dir}: manifest claims COMPLETE but api.baseUrl ${JSON.stringify(api.baseUrl)} is not the official ${OFFICIAL_API_BASE}`)
  }
 }
 if(manifest.status==='COMPLETE'&&api.customApiBase!==false){
  errors.push(`${dir}: manifest claims COMPLETE but api.customApiBase is not false`)
 }
}

function checkRawFiles(dir, manifest) {
 const raw=isObject(manifest.integrity)?manifest.integrity.rawFiles:undefined
 if(!isObject(raw)){
  if(manifest.status==='COMPLETE') errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles is missing`)
  return
 }
 if(typeof raw.ok!=='boolean') errors.push(`${dir}: manifest.integrity.rawFiles.ok must be a boolean`)
 if(typeof raw.filesConsistent!=='boolean') errors.push(`${dir}: manifest.integrity.rawFiles.filesConsistent must be a boolean`)
 if(typeof raw.evidenceConsistent!=='boolean') errors.push(`${dir}: manifest.integrity.rawFiles.evidenceConsistent must be a boolean`)
 if(!Array.isArray(raw.errors)) errors.push(`${dir}: manifest.integrity.rawFiles.errors must be an array`)
 if(!isObject(raw.status)){
  errors.push(`${dir}: manifest.integrity.rawFiles.status is missing`)
 }else{
  if(raw.status.claimed!==null&&typeof raw.status.claimed!=='string'){
   errors.push(`${dir}: manifest.integrity.rawFiles.status.claimed must be a string or null`)
  }
  if(typeof raw.status.verified!=='boolean'){
   errors.push(`${dir}: manifest.integrity.rawFiles.status.verified must be a boolean`)
  }
  if(raw.status.justified!==null&&typeof raw.status.justified!=='boolean'){
   errors.push(`${dir}: manifest.integrity.rawFiles.status.justified must be a boolean or null`)
  }
 }
 if(manifest.status!=='COMPLETE') return
 if(raw.ok!==true) errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.ok is not true`)
 if(raw.filesConsistent!==true) errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.filesConsistent is not true`)
 if(raw.evidenceConsistent!==true) errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.evidenceConsistent is not true`)
 if(Array.isArray(raw.errors)&&raw.errors.length){
  errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.errors is non-empty`)
 }
 if(isObject(raw.status)){
  if(raw.status.claimed!=='COMPLETE'){
   errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.status.claimed is ${JSON.stringify(raw.status.claimed)}`)
  }
  if(raw.status.verified!==true) errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.status.verified is not true`)
  if(raw.status.justified!==true) errors.push(`${dir}: manifest claims COMPLETE but integrity.rawFiles.status.justified is not true`)
 }
}

async function findSnapshots(dir) {
 let entries=[]
 try{entries=await readdir(dir,{withFileTypes:true})}catch(error){if(error.code==='ENOENT')return [];throw error}
 const found=[]
 for(const entry of entries){
  if(!entry.isDirectory()||entry.name==='node_modules'||entry.name.startsWith('.'))continue
  const child=join(dir,entry.name)
  if(entry.name==='research') found.push(...await findSnapshots(child))
  else{
   try{
    const manifest=JSON.parse(await readFile(join(child,'manifest.json'),'utf8'))
    const names=Object.keys(manifest.files||{})
    if(names.some((name)=>name.endsWith('.jsonl'))&&names.some((name)=>name.endsWith('.sqlite')||name.endsWith('.db')))found.push(child)
   }catch(error){if(error.code!=='ENOENT')throw error}
  }
 }
 return found
}

async function isExplicitSnapshot(dir) {
 try{return (await stat(join(dir,'manifest.json'))).isFile()}catch(error){if(error.code==='ENOENT')return false;throw error}
}

async function checkSnapshot(dir) {
 const manifestPath=join(dir,'manifest.json')
 let manifest
 try{manifest=JSON.parse(await readFile(manifestPath,'utf8'))}
 catch(error){errors.push(`${dir}: cannot read manifest.json: ${error.message}`);return}
 if(!isObject(manifest)){errors.push(`${dir}: manifest.json must contain a JSON object`);return}
 checkManifestShape(dir,manifest)
 checkDeclaredStatus(dir,manifest)
 checkWindowCoverage(dir,manifest)
 checkAliasLedger(dir,manifest)
 checkApiIdentity(dir,manifest)
 checkRawFiles(dir,manifest)
 const files=Object.keys(isObject(manifest.files)?manifest.files:{})
 if(!files.length) errors.push(`${dir}: manifest.files is empty`)
 const bytesByName=new Map()
 for(const name of files){
  if(name.includes('/')||name.includes('\\')||name==='.'||name==='..') {errors.push(`${dir}: unsafe manifest filename ${name}`);continue}
  try{
   const bytes=await readFile(join(dir,name));bytesByName.set(name,bytes)
   const entry=manifest.files[name]
   if(!isObject(entry)) {errors.push(`${dir}: manifest.files entry for ${name} is missing`);continue}
   const expected=entry.sha256
   if(typeof expected!=='string'||sha256(bytes)!==expected)errors.push(`${dir}: SHA-256 mismatch for ${name}`)
   if(!isCount(entry.bytes))errors.push(`${dir}: manifest.files entry for ${name} has no byte count`)
   else if(entry.bytes!==bytes.length)errors.push(`${dir}: byte-count mismatch for ${name} (manifest ${entry.bytes}, actual ${bytes.length})`)
  }catch(error){errors.push(`${dir}: cannot read ${name}: ${error.message}`)}
 }
 const jsonlName=files.find((name)=>name.endsWith('.jsonl'))
 const dbName=files.find((name)=>name.endsWith('.sqlite')||name.endsWith('.db'))
 if(!jsonlName||!dbName){errors.push(`${dir}: manifest must list one JSONL and one SQLite file`);return}
 if(!bytesByName.has(jsonlName)||!bytesByName.has(dbName))return
 let rows
 try{
  const text=bytesByName.get(jsonlName).toString('utf8')
  rows=text.split(/\r?\n/).filter((line)=>line.trim()).map((line,index)=>{
   try{return JSON.parse(line)}catch(error){throw new Error(`JSONL line ${index+1}: ${error.message}`)}
  })
 }catch(error){errors.push(`${dir}: ${error.message}`);return}
 const rowMap=new Map()
 for(const row of rows){
  if(!isObject(row)){errors.push(`${dir}: JSONL record is not an object`);continue}
  if(typeof row.recordId!=='string'||!row.recordId){errors.push(`${dir}: JSONL record has no recordId`);continue}
  for(const [jsonKey] of fields) if(!(jsonKey in row)) errors.push(`${dir}: JSONL ${row.recordId} missing field ${jsonKey}`)
  if(rowMap.has(row.recordId))errors.push(`${dir}: duplicate JSONL recordId ${row.recordId}`)
  rowMap.set(row.recordId,row)
 }
 if(manifest.recordCount!==rows.length)errors.push(`${dir}: manifest recordCount ${manifest.recordCount} != JSONL ${rows.length}`)

 let db
 try{db=new DatabaseSync(join(dir,dbName),{readOnly:true})}
 catch(error){errors.push(`${dir}: cannot open SQLite read-only: ${error.message}`);return}
 try{
  const integrity=db.prepare('PRAGMA integrity_check').all().map((row)=>Object.values(row)[0])
  if(integrity.length!==1||integrity[0]!=='ok')errors.push(`${dir}: SQLite integrity_check failed: ${integrity.join('; ')}`)
  const columns=new Set(db.prepare('PRAGMA table_info(trials)').all().map((row)=>row.name))
  for(const [,column] of fields) if(!columns.has(column))errors.push(`${dir}: SQLite trials table missing column ${column}`)
  const dbRows=db.prepare('SELECT * FROM trials').all()
  const dbMap=new Map(dbRows.map((row)=>[row.record_id,row]))
  if(manifest.dbCount!==dbRows.length)errors.push(`${dir}: manifest dbCount ${manifest.dbCount} != SQLite ${dbRows.length}`)
  if(rows.length!==dbRows.length)errors.push(`${dir}: JSONL ${rows.length} != SQLite ${dbRows.length}`)
  for(const id of rowMap.keys()){
   const sql=dbMap.get(id)
   if(!sql){errors.push(`${dir}: ${id} exists in JSONL but not SQLite`);continue}
   const source=rowMap.get(id)
   for(const [jsonKey,sqlKey,isJson] of fields){
    let actual=sql[sqlKey]
    try{if(isJson)actual=parseJson(actual,`${id}.${sqlKey}`)}catch(error){errors.push(`${dir}: ${error.message}`);continue}
    const expected=source[jsonKey]??null
    if(!equal(expected,actual))errors.push(`${dir}: field mismatch ${id}.${jsonKey} (SQLite ${sqlKey})`)
   }
  }
  for(const id of dbMap.keys())if(!rowMap.has(id))errors.push(`${dir}: ${id} exists in SQLite but not JSONL`)

  const statuses=db.prepare('SELECT query,source_id,state FROM source_statuses').all()
  if(manifest.sourceStatusRows!==statuses.length)errors.push(`${dir}: manifest sourceStatusRows ${manifest.sourceStatusRows} != SQLite ${statuses.length}`)
  const statusKeys=new Set()
  for(const row of statuses){
   if(typeof row.query!=='string'||typeof row.source_id!=='string'||typeof row.state!=='string'||!sourceStates.has(row.state)){
    errors.push(`${dir}: source_statuses row missing query/source_id/state or has unknown state`)
    continue
   }
   const key=JSON.stringify([row.query,row.source_id])
   if(statusKeys.has(key))errors.push(`${dir}: duplicate source status ${row.query}/${row.source_id}`)
   statusKeys.add(key)
  }
  const statusLabel=typeof manifest.status==='string'?manifest.status:'MISSING'
  const exitLabel=Number.isInteger(manifest.exitCode)?manifest.exitCode:'MISSING'
  console.log(`CHECK ${dir}: status=${statusLabel} exitCode=${exitLabel} records=${rows.length}/${dbRows.length} sourceStatuses=${statuses.length}`)
 }catch(error){errors.push(`${dir}: SQLite validation failed: ${error.message}`)}
 finally{db.close()}
}

let snapshots=[]
try{
 const info=await stat(target)
 if(!info.isDirectory())throw new Error('target is not a directory')
 if(await isExplicitSnapshot(target))snapshots=[target]
 else snapshots=await findSnapshots(target)
}catch(error){errors.push(`Cannot inspect ${target}: ${error.message}`)}
if(!snapshots.length){
 if(optional){console.log(`SKIP no clinical snapshot found under ${target}`)}
 else errors.push(`No clinical snapshot found under ${target}`)
}
for(const dir of snapshots) await checkSnapshot(dir)
for(const {dir,status,exitCode} of completionFailures){
 console.log(`NOT PASSED ${dir}: manifest status=${status} exitCode=${Number.isInteger(exitCode)?exitCode:'MISSING'} — only COMPLETE can pass`)
}
if(errors.length){
 for(const error of errors.slice(0,50))console.error(`FAIL ${error}`)
 if(errors.length>50)console.error(`FAIL … ${errors.length-50} more errors`)
 console.log(`FAIL snapshot consistency: ${errors.length} issue(s) (structural checks only; completeness, raw evidence, and source authenticity are not verified)`)
 process.exitCode=1
}else if(completionFailures.length){
 console.log(`NOT PASSED snapshot completeness: ${completionFailures.length} snapshot(s) not COMPLETE (structural checks passed; completeness, raw evidence, and source authenticity are not verified)`)
 process.exitCode=1
}else if(snapshots.length){
 console.log(`PASS snapshot consistency: ${snapshots.length} snapshot(s) — structural checks only; does not verify completeness, pagination, raw evidence, or source authenticity`)
}