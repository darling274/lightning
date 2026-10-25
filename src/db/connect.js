export async function loadMongo(usedBy = "@lightning/baileys") {
  try {
    const mod = await import("mongodb")
    return mod.default?.MongoClient ? mod.default : mod
  } catch (cause) {
    const err = new Error(`The "mongodb" package is required for ${usedBy}. Install it with: npm i mongodb`)
    err.cause = cause
    err.code = "MONGODB_MISSING"
    throw err
  }
}


export async function connectMongo({ uri, dbName, clientOptions } = {}) {
  if (!uri) throw new Error("connectMongo needs a `uri`")
  const { MongoClient } = await loadMongo("connectMongo")
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 15_000, ...clientOptions })
  await client.connect()
  const db = client.db(dbName)
  return { client, db, close: () => client.close() }
}
