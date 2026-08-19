// RunElite backend — funciona en dos modos, sin que tengas que elegir nada:
//
//  - Sin variable DATABASE_URL: guarda todo en db.json junto a este archivo
//    (perfecto para probar en tu máquina, cero configuración).
//  - Con DATABASE_URL (Postgres de Neon, gratis): los datos son persistentes
//    de verdad y sobreviven a cada redeploy en Render.
//
// Ejecutar local:  node server.js            → abre http://localhost:3000
// Ejecutar con DB:  DATABASE_URL="postgres://..." node server.js

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const USE_POSTGRES = !!process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// CAPA DE ALMACENAMIENTO — misma interfaz, dos implementaciones
// ---------------------------------------------------------------------------
let store;

if (USE_POSTGRES) {
  // "pg" solo se exige cuando de verdad hay una base de datos configurada,
  // así el modo local (sin DATABASE_URL) sigue sin necesitar npm install.
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS leaderboard (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
      world TEXT,
      ghost TEXT,
      time_s INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `).catch((e) => {
    console.error("No se pudo preparar el esquema en Postgres:", e.message);
  });

  store = {
    async getProfile(id) {
      await ready;
      const r = await pool.query("SELECT data FROM profiles WHERE id=$1", [id]);
      return r.rows[0] ? r.rows[0].data : null;
    },
    async saveProfile(id, patch) {
      await ready;
      const existing = await store.getProfile(id);
      const merged = { ...(existing || {}), ...patch, id, updatedAt: Date.now() };
      await pool.query(
        `INSERT INTO profiles (id, data) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
        [id, merged]
      );
      return merged;
    },
    async getLeaderboard() {
      await ready;
      const r = await pool.query(
        `SELECT username, world, ghost, time_s AS "timeS", extract(epoch from created_at)*1000 AS date
         FROM leaderboard ORDER BY time_s ASC LIMIT 50`
      );
      return r.rows;
    },
    async addLeaderboardEntry(entry) {
      await ready;
      await pool.query(
        `INSERT INTO leaderboard (username, world, ghost, time_s) VALUES ($1,$2,$3,$4)`,
        [entry.username, entry.world, entry.ghost, entry.timeS]
      );
      // Mantiene la tabla liviana: conserva solo los 200 mejores tiempos.
      await pool.query(`
        DELETE FROM leaderboard WHERE id NOT IN (
          SELECT id FROM leaderboard ORDER BY time_s ASC LIMIT 200
        )
      `);
      return entry;
    },
  };
} else {
  function loadFile() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
    catch { return { profiles: {}, leaderboard: [] }; }
  }
  function saveFile(db) {
    fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(DB_FILE + ".tmp", DB_FILE);
  }
  if (!fs.existsSync(DB_FILE)) saveFile({ profiles: {}, leaderboard: [] });

  store = {
    async getProfile(id) {
      const db = loadFile();
      return db.profiles[id] || null;
    },
    async saveProfile(id, patch) {
      const db = loadFile();
      const merged = { ...(db.profiles[id] || {}), ...patch, id, updatedAt: Date.now() };
      db.profiles[id] = merged;
      saveFile(db);
      return merged;
    },
    async getLeaderboard() {
      const db = loadFile();
      return [...db.leaderboard].sort((a, b) => a.timeS - b.timeS).slice(0, 50);
    },
    async addLeaderboardEntry(entry) {
      const db = loadFile();
      db.leaderboard.push({ ...entry, id: crypto.randomUUID(), date: Date.now() });
      db.leaderboard = db.leaderboard.sort((a, b) => a.timeS - b.timeS).slice(0, 200);
      saveFile(db);
      return entry;
    },
  };
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  if (url.pathname === "/api/profile" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) return sendJSON(res, 400, { error: "Falta id" });
    const profile = await store.getProfile(id);
    return sendJSON(res, 200, { profile });
  }

  if (url.pathname === "/api/profile" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.id) return sendJSON(res, 400, { error: "Falta id" });
    const profile = await store.saveProfile(body.id, body);
    return sendJSON(res, 200, { profile });
  }

  if (url.pathname === "/api/leaderboard" && req.method === "GET") {
    const rows = await store.getLeaderboard();
    return sendJSON(res, 200, { rows });
  }

  if (url.pathname === "/api/leaderboard" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.username || !body.timeS) return sendJSON(res, 400, { error: "Datos incompletos" });
    const entry = {
      username: String(body.username).slice(0, 40),
      world: String(body.world || "").slice(0, 60),
      ghost: String(body.ghost || "").slice(0, 80),
      timeS: Number(body.timeS),
    };
    await store.addLeaderboardEntry(entry);
    return sendJSON(res, 200, { ok: true, entry });
  }

  return sendJSON(res, 404, { error: "Ruta no encontrada" });
}

// ---------------------------------------------------------------------------
// Servidor estático (sirve /public) + API
// ---------------------------------------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  if (url.pathname.startsWith("/api/")) {
    try {
      return await handleApi(req, res, url);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

if (!fs.existsSync(DB_FILE)) saveDB({ profiles: {}, leaderboard: [] });

server.listen(PORT, () => {
  console.log(`RunElite backend real corriendo en http://localhost:${PORT}`);
  console.log(`Ranking global compartido en db.json — abre esta URL desde cualquier navegador de tu red.`);
});
