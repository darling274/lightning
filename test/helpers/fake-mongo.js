const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o)
const set = (o, p, v) => { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] ??= {}; c[ks.at(-1)] = v }
const match = (doc, f = {}) => Object.entries(f).every(([k, v]) => {
  const x = get(doc, k)
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("$in" in v) return v.$in.includes(x)
    if ("$lt" in v) return x < v.$lt
    if ("$gt" in v) return x > v.$gt
  }
  return x === v
})

export class FakeCollection {
  constructor(name) { this.collectionName = name; this.docs = []; this.indexes = [] }
  async createIndex(spec, opts) { this.indexes.push({ spec, opts }) }
  async findOne(f) { return structuredClone(this.docs.find(d => match(d, f))) ?? null }
  find(f) {
    let rows = this.docs.filter(d => match(d, f)).map(d => structuredClone(d))
    const cur = { sort(s) { const ks = Object.entries(s); rows.sort((a, b) => { for (const [k, dir] of ks) { const x = get(a, k), y = get(b, k); if (x > y) return dir; if (x < y) return -dir } return 0 }); return cur }, limit(n) { rows = rows.slice(0, n); return cur }, toArray: async () => rows }
    return cur
  }
  async countDocuments(f) { return this.docs.filter(d => match(d, f)).length }
  async deleteMany(f) { this.docs = this.docs.filter(d => !match(d, f)) }
  async bulkWrite(ops) {
    for (const op of ops) {
      if (op.insertOne) this.docs.push(structuredClone(op.insertOne.document))
      else if (op.updateOne) {
        let d = this.docs.find(x => match(x, op.updateOne.filter))
        if (!d && op.updateOne.upsert) { d = { ...op.updateOne.filter }; this.docs.push(d) }
        if (d) for (const [k, v] of Object.entries(op.updateOne.update.$set || {})) set(d, k, structuredClone(v))
      } else if (op.deleteOne) { const i = this.docs.findIndex(x => match(x, op.deleteOne.filter)); if (i >= 0) this.docs.splice(i, 1) }
      else if (op.deleteMany) this.docs = this.docs.filter(d => !match(d, op.deleteMany.filter))
    }
  }
}
export class FakeDb {
  constructor() { this.cols = new Map() }
  collection(n) { if (!this.cols.has(n)) this.cols.set(n, new FakeCollection(n)); return this.cols.get(n) }
}
