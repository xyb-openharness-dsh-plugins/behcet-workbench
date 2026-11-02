// Pure candidate mapping. No API calls, credentials or business writes.
const text = (v) => typeof v === 'string' && v.trim() ? v.trim() : null

export function parseAmapLocation(value) {
  if (typeof value !== 'string') return null
  const parts = value.split(',').map((v) => v.trim())
  if (parts.length !== 2 || parts.some((v) => !v || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v))) return null
  const [longitude, latitude] = parts.map(Number)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null
  return { longitude, latitude, crs: 'GCJ-02' }
}

export function normalizeAmapPoi(row, { fetchedAt } = {}) {
  if (typeof fetchedAt !== 'string' || !Number.isFinite(Date.parse(fetchedAt)))
    throw new TypeError('Provide the original provider-fetch timestamp; do not refresh cached provenance')
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const providerId = text(row.id), name = text(row.name)
  if (!providerId || !name) return null
  const type = typeof row.typecode === 'number' && Number.isSafeInteger(row.typecode)
    ? String(row.typecode) : text(row.typecode)
  return {
    id: `amap:${providerId}`, provider: 'amap', providerId, name,
    address: text(row.address), province: text(row.pname), city: text(row.cityname), district: text(row.adname),
    typeCode: type && /^\d{6}$/.test(type) ? type : null,
    location: parseAmapLocation(row.location),
    source: { provider: 'amap', providerId, fetchedAt },
    candidateStatus: 'unreviewed', verificationStatus: 'unverified',
  }
}
