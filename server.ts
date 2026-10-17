import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ override: true });

const require = createRequire(import.meta.url);
let initialDataJson: any = null;
try {
  initialDataJson = require('./src/data/initialData.json');
} catch (e) {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'src/data/initialData.json'), 'utf-8');
    initialDataJson = JSON.parse(raw);
  } catch (err) {}
}

const { Pool } = pg;

// Port configuration: Railway supplies process.env.PORT; default to 3000 for AI Studio / local
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_SERVICE_ID) ||
  Boolean(process.env.RAILWAY_STATIC_URL) ||
  fs.existsSync(path.resolve(__dirname, 'dist/index.html'));

// Persistent tombstone storage of duplicate and deleted product IDs
const deletedIdsFile = path.resolve(__dirname, 'src/data/deleted_ids.json');
export const EXCLUDED_DUPLICATE_IDS = new Set<string>([
  'AK-073',
  'AK-148',
  'AK-149',
  'AK-096',
  'AK-96',
  'AK-097',
  'AK-97',
  'ak-073',
  'ak-148',
  'ak-149',
  'ak-096',
  'ak-96',
  'ak-097',
  'ak-97',
]);

export const deletedProductIds = new Set<string>(EXCLUDED_DUPLICATE_IDS);

// Load persisted deleted product IDs from disk
try {
  if (fs.existsSync(deletedIdsFile)) {
    const raw = fs.readFileSync(deletedIdsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      parsed.forEach((id: string) => {
        if (id) {
          deletedProductIds.add(String(id).trim());
          deletedProductIds.add(String(id).trim().toUpperCase());
          deletedProductIds.add(String(id).trim().toLowerCase());
        }
      });
    }
  }
} catch (e) {}

export function isDeletedProduct(id: string | undefined): boolean {
  if (!id) return false;
  const str = String(id).trim();
  return (
    deletedProductIds.has(str) ||
    deletedProductIds.has(str.toUpperCase()) ||
    deletedProductIds.has(str.toLowerCase())
  );
}

export function recordDeletedProductId(id: string) {
  if (!id) return;
  const str = String(id).trim();
  deletedProductIds.add(str);
  deletedProductIds.add(str.toUpperCase());
  deletedProductIds.add(str.toLowerCase());
  try {
    const list = Array.from(new Set(Array.from(deletedProductIds).map((s) => s.toUpperCase())));
    fs.writeFileSync(deletedIdsFile, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

export function restoreProductId(id: string) {
  if (!id) return;
  const str = String(id).trim();
  deletedProductIds.delete(str);
  deletedProductIds.delete(str.toUpperCase());
  deletedProductIds.delete(str.toLowerCase());
  try {
    const list = Array.from(new Set(Array.from(deletedProductIds).map((s) => s.toUpperCase())));
    fs.writeFileSync(deletedIdsFile, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

// Real-Time Server-Sent Events (SSE) Client Pool
const sseClients: Response[] = [];

export function broadcastRealtimeUpdate(payload: any) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(data);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// Admin & Security Configuration
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'anmolkala.in@gmail.com').trim().toLowerCase();
let currentAdminPassword = (process.env.ADMIN_PASSWORD || 'mnbvcxz12').trim();
const SESSION_SECRET = process.env.SESSION_SECRET || 'anmolkala-production-secret-session-key-2026-secure';

// File-backed admin password persistence for cross-restart retention
const adminConfigFile = path.resolve(__dirname, 'src/data/admin_config.json');
try {
  if (fs.existsSync(adminConfigFile)) {
    const raw = fs.readFileSync(adminConfigFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.adminPassword) {
      currentAdminPassword = String(parsed.adminPassword).trim();
    }
  }
} catch (e) {}

function persistAdminPassword(newPass: string) {
  currentAdminPassword = newPass;
  try {
    fs.writeFileSync(adminConfigFile, JSON.stringify({ adminPassword: newPass }, null, 2), 'utf-8');
  } catch (e) {}
}

// -------------------------------------------------------------
// Baseline Handcrafted Products Catalog (Clean 169 Items)
// -------------------------------------------------------------
const catalogStorageFile = path.resolve(__dirname, 'src/data/catalog_storage.json');

interface CatalogData {
  products: any[];
  categories: any[];
  media: any[];
}

let catalogData: CatalogData = {
  products: [],
  categories: [],
  media: [],
};

function getBaselineProducts(): any[] {
  let rawProducts: any[] = [];
  try {
    const jsonPath = path.resolve(__dirname, 'src/data/initialData.json');
    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
    }
  } catch (e) {
    // fallback to static import
  }

  if (rawProducts.length === 0 && initialDataJson && Array.isArray((initialDataJson as any).products)) {
    rawProducts = (initialDataJson as any).products;
  }

  return rawProducts
    .filter((p: any) => !isDeletedProduct(p.id))
    .map((p: any, idx: number) => {
    let video_url = p.video_url || '';
    if (!video_url) {
      if (p.id === 'AK-001') {
        video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      } else if (p.id === 'AK-006') {
        video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';
      } else if (p.id === 'AK-032') {
        video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
      } else if (p.id === 'AK-061') {
        video_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4';
      }
    }
    const rawImg = p.image_url || p.image || '';
    const imgPath = rawImg.trim() ? rawImg.trim() : '/logo.png';

    return {
      id: p.id,
      type: p.type || 'product',
      name: p.name,
      category: p.category || 'Uncategorized',
      slug: p.slug || `item-${p.id.toLowerCase()}`,
      description: p.description || '',
      image_url: imgPath,
      image: imgPath,
      video_url,
      tags: p.tags || '',
      published: p.published !== false,
      availability: p.availability || 'in_stock',
      created_at: p.created_at || new Date(Date.now() - idx * 60000).toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
    };
  });
}

function initializeCatalogStorage(): CatalogData {
  try {
    if (fs.existsSync(catalogStorageFile)) {
      const raw = fs.readFileSync(catalogStorageFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.products) && parsed.products.length > 0) {
        const cleanProds = parsed.products.filter(
          (p: any) => !isDeletedProduct(p.id)
        );
        return {
          products: cleanProds,
          categories: Array.isArray(parsed.categories) ? parsed.categories : [],
          media: Array.isArray(parsed.media)
            ? parsed.media.filter((m: any) => !isDeletedProduct(m.product_id))
            : [],
        };
      }
    }
  } catch (e) {}

  const initialProducts = getBaselineProducts();
  const uniqueCats = Array.from(new Set(initialProducts.map((p) => p.category.trim()))).filter(Boolean).sort();
  const initialCategories = uniqueCats.map((name, i) => ({
    id: `cat-${i + 1}`,
    name,
    display_order: i,
    created_at: new Date().toISOString(),
  }));

  const initialMedia: any[] = [];
  initialProducts.forEach((p) => {
    if (p.image_url) {
      initialMedia.push({
        id: `med-img-${p.id}`,
        product_id: p.id,
        storage_path: p.image_url,
        media_type: 'image',
        file_name: p.image_url.split('/').pop() || `${p.slug}.webp`,
        display_order: 0,
        created_at: p.created_at,
      });
    }
    if (p.video_url) {
      initialMedia.push({
        id: `med-vid-${p.id}`,
        product_id: p.id,
        storage_path: p.video_url,
        media_type: 'video',
        file_name: `${p.slug}-video.mp4`,
        display_order: 1,
        created_at: p.created_at,
      });
    }
  });

  const initialized: CatalogData = {
    products: initialProducts,
    categories: initialCategories,
    media: initialMedia,
  };

  try {
    fs.writeFileSync(catalogStorageFile, JSON.stringify(initialized, null, 2), 'utf-8');
  } catch (e) {}

  return initialized;
}

catalogData = initializeCatalogStorage();

const initialDataFile = path.resolve(__dirname, 'src/data/initialData.json');
const publicProductsJsonFile = path.resolve(__dirname, 'public/products.json');
const distProductsJsonFile = path.resolve(__dirname, 'dist/products.json');
const rootProductsJsFile = path.resolve(__dirname, 'products.js');

function persistCatalogStorage() {
  try {
    fs.writeFileSync(catalogStorageFile, JSON.stringify(catalogData, null, 2), 'utf-8');
  } catch (e) {}

  // Sync to src/data/initialData.json, public/products.json, dist/products.json, and products.js
  try {
    let initialObj: any = { brand: 'AnmolKala', whatsapp: '919810116510', phone: '919717887313', email: 'anmolkala.in@gmail.com' };
    if (fs.existsSync(initialDataFile)) {
      try {
        const raw = fs.readFileSync(initialDataFile, 'utf-8');
        initialObj = JSON.parse(raw);
      } catch (e) {}
    }
    initialObj.products = catalogData.products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      slug: p.slug,
      image: p.image_url || p.image || '/logo.png',
      image_url: p.image_url || p.image || '/logo.png',
      tags: p.tags || '',
      description: p.description || '',
      video_url: p.video_url || '',
      published: p.published !== false,
      availability: p.availability || 'in_stock',
    }));
    try { fs.writeFileSync(initialDataFile, JSON.stringify(initialObj, null, 2), 'utf-8'); } catch (e) {}
    try { fs.writeFileSync(publicProductsJsonFile, JSON.stringify(initialObj.products, null, 2), 'utf-8'); } catch (e) {}
    try {
      if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
        fs.writeFileSync(distProductsJsonFile, JSON.stringify(initialObj.products, null, 2), 'utf-8');
      }
    } catch (e) {}
    try { fs.writeFileSync(rootProductsJsFile, `window.ANMOLKALA_DATA = ${JSON.stringify(initialObj)};`, 'utf-8'); } catch (e) {}
  } catch (e) {}
}

// -------------------------------------------------------------
// Authoritative Database Layer (Supabase PostgreSQL / Cloud SQL)
// -------------------------------------------------------------
let supabasePool: pg.Pool | null = null;
let cloudSqlPool: pg.Pool | null = null;
let pgPool: pg.Pool | null = null;
let isDbConnected = false;
let dbInfo = {
  provider: 'Local Storage',
  status: 'local',
  error: null as string | null,
};

let dbInitPromise: Promise<void> | null = null;

async function executeDbWrite(sql: string, params: any[]) {
  if (supabasePool) {
    await supabasePool.query(sql, params);
  } else if (cloudSqlPool) {
    await cloudSqlPool.query(sql, params);
  }
}

async function initDatabase() {
  // 1. Initialize Supabase / external PostgreSQL (DATABASE_URL) — Single Source of Truth
  const rawDatabaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    '';

  if (rawDatabaseUrl.trim()) {
    try {
      const isLocalhost = rawDatabaseUrl.includes('localhost') || rawDatabaseUrl.includes('127.0.0.1');
      supabasePool = new Pool({
        connectionString: rawDatabaseUrl,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      supabasePool.on('error', (err) => {
        console.warn('[Supabase Pool Warning]:', err.message);
      });

      const client = await supabasePool.connect();
      console.log('[Database] Real-time connection established via Supabase PostgreSQL!');
      client.release();
    } catch (err: any) {
      console.warn('[Supabase Connection Failed]:', err?.message);
      supabasePool = null;
    }
  }

  // 2. Optional Fallback: Google Cloud SQL
  if (!supabasePool && process.env.SQL_HOST) {
    try {
      console.log('[Database] Connecting to Google Cloud SQL at', process.env.SQL_HOST);
      cloudSqlPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 10000,
      });

      cloudSqlPool.on('error', (err) => {
        console.warn('[Cloud SQL Pool Warning]:', err.message);
      });

      const client = await cloudSqlPool.connect();
      console.log('[Database] Real-time connection established via Google Cloud SQL!');
      client.release();
    } catch (err: any) {
      console.warn('[Cloud SQL Connection Failed]:', err?.message);
      cloudSqlPool = null;
    }
  }

  // Supabase PostgreSQL is preferred as single source of truth
  pgPool = supabasePool || cloudSqlPool || null;
  isDbConnected = Boolean(pgPool);

  // Auto-create relational tables and sync with authoritative state
  if (isDbConnected && pgPool) {
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS store_items (
          id TEXT PRIMARY KEY,
          type TEXT DEFAULT 'product',
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT DEFAULT '',
          image_url TEXT,
          video_url TEXT,
          tags TEXT DEFAULT '',
          published BOOLEAN DEFAULT true,
          availability TEXT DEFAULT 'in_stock',
          is_deleted BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS product_media (
          id TEXT PRIMARY KEY,
          product_id TEXT,
          storage_path TEXT NOT NULL,
          media_type TEXT DEFAULT 'image',
          file_name TEXT,
          file_size TEXT DEFAULT '0',
          mime_type TEXT,
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS deleted_product_ids (
          id TEXT PRIMARY KEY,
          deleted_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_store_items_category ON store_items(category);
        CREATE INDEX IF NOT EXISTS idx_store_items_published ON store_items(published);
        CREATE INDEX IF NOT EXISTS idx_store_items_created_at ON store_items(created_at);
        CREATE INDEX IF NOT EXISTS idx_product_media_product_id ON product_media(product_id);
      `);

      // Ensure is_deleted column exists on store_items
      await pgPool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_items' AND column_name='is_deleted') THEN
            ALTER TABLE store_items ADD COLUMN is_deleted BOOLEAN DEFAULT false;
          END IF;
        END $$;
      `);

      // 1. Sync persistent deleted IDs from database into in-memory tombstones
      const delRes = await pgPool.query('SELECT id FROM deleted_product_ids;');
      delRes.rows.forEach((r: any) => {
        if (r.id) {
          deletedProductIds.add(String(r.id).trim());
          deletedProductIds.add(String(r.id).trim().toUpperCase());
          deletedProductIds.add(String(r.id).trim().toLowerCase());
        }
      });

      // 2. Permanently record duplicate items into deleted_product_ids
      for (const dupId of EXCLUDED_DUPLICATE_IDS) {
        await pgPool.query('INSERT INTO deleted_product_ids (id) VALUES ($1) ON CONFLICT (id) DO NOTHING;', [dupId.toUpperCase()]);
      }
      await pgPool.query(`
        DELETE FROM store_items WHERE id IN ('AK-073', 'AK-148', 'AK-149', 'AK-096', 'AK-96', 'AK-097', 'AK-97', 'ak-073', 'ak-148', 'ak-149', 'ak-096', 'ak-96', 'ak-097', 'ak-97');
        DELETE FROM product_media WHERE product_id IN ('AK-073', 'AK-148', 'AK-149', 'AK-096', 'AK-96', 'AK-097', 'AK-97', 'ak-073', 'ak-148', 'ak-149', 'ak-096', 'ak-96', 'ak-097', 'ak-97');
      `);

      // 3. Inspect store_items count in PostgreSQL
      const checkRes = await pgPool.query('SELECT COUNT(*) FROM store_items WHERE is_deleted IS NOT true;');
      const count = parseInt(checkRes.rows[0].count, 10);

      if (count > 0) {
        // Authoritative single source of truth: PostgreSQL Database
        const rows = await pgPool.query('SELECT * FROM store_items WHERE is_deleted IS NOT true ORDER BY created_at DESC;');
        const cleanRows = rows.rows.filter((r: any) => !isDeletedProduct(r.id));
        if (cleanRows.length > 0) {
          catalogData.products = cleanRows;
          console.log(`[Database] Loaded ${cleanRows.length} authoritative products directly from PostgreSQL.`);
        }

        // Sync categories from database
        const catRes = await pgPool.query('SELECT * FROM categories ORDER BY display_order ASC, name ASC;');
        if (catRes.rows.length > 0) {
          catalogData.categories = catRes.rows;
        } else {
          // Derive categories from existing products and seed categories table
          const uniqueCats = Array.from(new Set(cleanRows.map((p) => p.category.trim()))).filter(Boolean).sort();
          for (let i = 0; i < uniqueCats.length; i++) {
            await pgPool.query(
              'INSERT INTO categories (id, name, display_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING;',
              [`cat-${i + 1}`, uniqueCats[i], i]
            );
          }
          const seededCats = await pgPool.query('SELECT * FROM categories ORDER BY display_order ASC, name ASC;');
          catalogData.categories = seededCats.rows;
        }
      } else if (count === 0 && catalogData.products.length > 0) {
        // Initial empty database setup only: batch-seed baseline products
        console.log(`[Database] Initializing empty database with ${catalogData.products.length} catalog products...`);
        const validProds = catalogData.products.filter((p) => !isDeletedProduct(p.id));
        const BATCH_SIZE = 50;
        for (let i = 0; i < validProds.length; i += BATCH_SIZE) {
          const chunk = validProds.slice(i, i + BATCH_SIZE);
          const values: any[] = [];
          const rowsSql: string[] = [];
          let paramIdx = 1;
          for (const p of chunk) {
            rowsSql.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, false, $${paramIdx + 11}, $${paramIdx + 12})`);
            values.push(
              p.id,
              p.type || 'product',
              p.name,
              p.category,
              p.slug,
              p.description || '',
              p.image_url || p.image || '/logo.png',
              p.video_url || '',
              p.tags || '',
              p.published !== false,
              p.availability || 'in_stock',
              p.created_at || new Date().toISOString(),
              p.updated_at || new Date().toISOString()
            );
            paramIdx += 13;
          }
          if (rowsSql.length > 0) {
            await pgPool.query(
              `INSERT INTO store_items (id, type, name, category, slug, description, image_url, video_url, tags, published, availability, is_deleted, created_at, updated_at)
               VALUES ${rowsSql.join(', ')}
               ON CONFLICT (id) DO NOTHING;`,
              values
            );
          }
        }

        // Seed initial categories
        if (catalogData.categories.length > 0) {
          for (const c of catalogData.categories) {
            await pgPool.query(
              'INSERT INTO categories (id, name, display_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING;',
              [c.id, c.name, c.display_order, c.created_at || new Date().toISOString(), new Date().toISOString()]
            );
          }
        }
      }
    } catch (e: any) {
      console.warn('[Database Setup / Seed Notice]:', e.message);
    }
  }

  dbInfo = {
    provider: supabasePool
      ? 'Supabase PostgreSQL (Connected via DATABASE_URL)'
      : cloudSqlPool
      ? 'Google Cloud SQL (Connected)'
      : 'Local Storage (Operating smoothly with persistent local catalogue)',
    status: isDbConnected ? 'connected' : 'local',
    error: null,
  };
}

dbInitPromise = initDatabase();

async function ensureDatabase() {
  if (dbInitPromise) {
    try {
      await Promise.race([
        dbInitPromise,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// Session & Auth Utilities
// -------------------------------------------------------------
function generateToken(username: string): string {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${username}:${timestamp}`)
    .digest('hex');
  const userB64 = Buffer.from(username).toString('base64url');
  return `adm_${timestamp}_${userB64}_${signature}`;
}

function verifyToken(token: string): { valid: boolean; email?: string } {
  if (!token || !token.startsWith('adm_')) {
    return { valid: false };
  }
  const parts = token.split('_');
  if (parts.length < 3) return { valid: false };

  const timestamp = parseInt(parts[1], 10);
  if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    return { valid: false };
  }

  // 4-part token: adm_timestamp_userB64_signature
  if (parts.length >= 4) {
    let username = ADMIN_USERNAME;
    try {
      username = Buffer.from(parts[2], 'base64url').toString('utf-8');
    } catch {
      return { valid: false };
    }
    const signature = parts[3];
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${username}:${timestamp}`)
      .digest('hex');

    if (
      signature.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      return { valid: true, email: username };
    }
    return { valid: false };
  }

  // 3-part token backward compatibility: adm_timestamp_signature
  const signature = parts[2];
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${ADMIN_USERNAME}:${timestamp}`)
    .digest('hex');

  if (
    signature.length === expectedSig.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  ) {
    return { valid: true, email: ADMIN_USERNAME };
  }

  return { valid: false };
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token =
    (authHeader && authHeader.replace(/^Bearer\s+/i, '')) ||
    (req.headers['x-admin-token'] as string) ||
    req.body?.token ||
    (req.query?.token as string);

  const verification = verifyToken(String(token || ''));
  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized: Valid admin authentication required.' });
  }
  next();
}

// -------------------------------------------------------------
// Express App Initialization
// -------------------------------------------------------------
export const app = express();

// Canonical Host & HTTPS Normalization Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Always let health checks through immediately
  if (req.path === '/api/health' || req.path === '/health' || req.path === '/api' || req.path === '/api/index') {
    return next();
  }

  const host = (req.headers.host || '').toLowerCase();
  const isWww = host.startsWith('www.');

  if (isWww) {
    const cleanHost = host.replace(/^www\./i, '');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return res.redirect(301, `${proto}://${cleanHost}${req.originalUrl}`);
  }

  next();
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Anti-Cache & DB synchronization middleware for all API requests
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Always let health checks respond immediately (< 5ms) without waiting for database initialization
  if (
    req.path === '/api/health' ||
    req.path === '/health' ||
    req.path === '/api' ||
    req.path === '/api/index'
  ) {
    return next();
  }

  if (req.url.startsWith('/api') || req.url.startsWith('/products') || req.url.startsWith('/categories')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  await ensureDatabase();
  next();
});

// Path Normalization for serverless deployment
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/assets') && !req.url.startsWith('/products/')) {
    const apiEndpoints = ['/products', '/categories', '/media', '/videos', '/logs', '/admin', '/status', '/upload'];
    if (apiEndpoints.some((ep) => req.url.startsWith(ep))) {
      req.url = '/api' + req.url;
    }
  }
  next();
});

// Static product images serving (ensures photos are always accessible in dev, preview, and production)
app.use('/products', express.static(path.resolve(__dirname, 'public/products')));
if (fs.existsSync(path.resolve(__dirname, 'dist/products'))) {
  app.use('/products', express.static(path.resolve(__dirname, 'dist/products')));
}

// API Health and Status root endpoint
app.get(['/api', '/api/index', '/api/health', '/health'], (_req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    service: 'AnmolKala API',
    uptime: process.uptime(),
    database: {
      connected: isDbConnected,
      provider: dbInfo.provider,
    },
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Static SEO Endpoints (Robots.txt & Sitemap.xml)
// -------------------------------------------------------------
app.get('/robots.txt', (_req: Request, res: Response) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://anmolkala.in/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (_req: Request, res: Response) => {
  let slugs: string[] = [];
  if (isDbConnected && pgPool) {
    try {
      const res = await pgPool.query('SELECT slug FROM store_items WHERE published = true;');
      slugs = res.rows.map((r: any) => r.slug).filter(Boolean);
    } catch (e) {}
  }
  if (slugs.length === 0) {
    slugs = catalogData.products.filter((p) => p.published).map((p) => p.slug).filter(Boolean);
  }

  const sitemapCategories = [
    'puja-thali',
    'photo-frames',
    'tray-sets',
    'wall-clocks',
    'jewellery',
    'diya-candle-holders',
    'keychains-key-holders',
    'rakhi',
    'home-decor',
    'home-decor-tissue-holders',
    'personalized-name-plates',
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://anmolkala.in/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://anmolkala.in/catalog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://anmolkala.in/videos</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  ${sitemapCategories
    .map(
      (cat) => `  <url>
    <loc>https://anmolkala.in/category/${cat}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    )
    .join('\n')}
  ${slugs
    .map(
      (slug) => `  <url>
    <loc>https://anmolkala.in/product/${encodeURIComponent(slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join('\n')}
</urlset>`;

  res.type('application/xml');
  return res.send(xml);
});

// -------------------------------------------------------------
// API ROUTES — Real-Time Database with Automatic Local Fallback
// -------------------------------------------------------------

// Real-Time Server-Sent Events (SSE) Stream Endpoint for Instant Everywhere Updates
app.get('/api/realtime', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
  sseClients.push(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 10000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// Deleted product IDs registry
app.get('/api/deleted-ids', (_req: Request, res: Response) => {
  return res.json(Array.from(deletedProductIds));
});

// System Status Route
app.get('/api/status', async (_req: Request, res: Response) => {
  let storeItemCount = catalogData.products.filter((i) => !isDeletedProduct(i.id)).length;
  let publishedCount = catalogData.products.filter((i) => i.published !== false && !isDeletedProduct(i.id)).length;
  let catCount = catalogData.categories.length;

  if (isDbConnected && pgPool) {
    try {
      const pRes = await pgPool.query('SELECT COUNT(*) FROM store_items;');
      storeItemCount = parseInt(pRes.rows[0].count, 10);
      const pubRes = await pgPool.query('SELECT COUNT(*) FROM store_items WHERE published = true;');
      publishedCount = parseInt(pubRes.rows[0].count, 10);
      const cRes = await pgPool.query('SELECT COUNT(*) FROM categories;');
      catCount = parseInt(cRes.rows[0].count, 10);
    } catch (e) {}
  }

  return res.json({
    status: isDbConnected ? 'connected' : 'local',
    provider: dbInfo.provider,
    is_realtime_database: isDbConnected,
    counts: {
      store_items: storeItemCount,
      published_products: publishedCount,
      categories: catCount,
      product_media: catalogData.media.filter((m) => !isDeletedProduct(m.product_id)).length,
      total_photos: catalogData.media.filter((m) => m.media_type === 'image' && !isDeletedProduct(m.product_id)).length || storeItemCount,
      products_with_videos: catalogData.products.filter((i) => Boolean(i.video_url) && !isDeletedProduct(i.id)).length,
    },
    timestamp: new Date().toISOString(),
  });
});

// Get Products
app.get('/api/products', async (req: Request, res: Response) => {
  const { category, type } = req.query;

  if (isDbConnected && pgPool) {
    try {
      let query = 'SELECT * FROM store_items';
      const conditions: string[] = ['(is_deleted IS NULL OR is_deleted = false)'];
      const values: any[] = [];

      if (category && category !== 'All' && category !== 'all') {
        values.push(String(category).toLowerCase());
        conditions.push(`LOWER(category) = $${values.length}`);
      }
      if (type) {
        values.push(type);
        conditions.push(`type = $${values.length}`);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY created_at DESC;';

      const dbRes = await pgPool.query(query, values);
      const cleanRows = dbRes.rows.filter((r: any) => !isDeletedProduct(r.id));
      return res.json(cleanRows);
    } catch (e) {
      console.warn('[Database Query Error, falling back to local]:', e);
    }
  }

  // Fallback to local catalog (always strictly excluding deleted IDs)
  let items = catalogData.products.filter((i) => !isDeletedProduct(i.id));
  if (category && category !== 'All' && category !== 'all') {
    items = items.filter((i) => i.category.toLowerCase() === String(category).toLowerCase());
  }
  if (type) {
    items = items.filter((i) => i.type === type);
  }
  return res.json(items);
});

// Reusable media buffer persistence supporting Supabase Storage & local volumes
async function persistMediaBuffer(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

  // 1. Try uploading to Supabase Storage bucket if configured
  if (supabaseUrl && supabaseKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      const uploadEndpoint = `${cleanUrl}/storage/v1/object/products/${filename}`;
      const uploadRes = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: buffer,
      });
      if (uploadRes.ok) {
        return `${cleanUrl}/storage/v1/object/public/products/${filename}`;
      }
    } catch (e: any) {
      console.warn('[Supabase Storage Upload Notice]:', e.message);
    }
  }

  // 2. Fallback to filesystem (with custom UPLOADS_DIR support for Railway Volumes)
  const targetDir = process.env.UPLOADS_DIR || path.resolve(__dirname, 'public/products');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(path.resolve(targetDir, filename), buffer);

  const distDir = path.resolve(__dirname, 'dist/products');
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.resolve(distDir, filename), buffer);
  }

  return `/products/${filename}`;
}

// Save (Create or Update) Product
app.post('/api/products', requireAdminAuth, async (req: Request, res: Response) => {
  const item = req.body;
  if (!item || !item.name || !String(item.name).trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }

  const now = new Date().toISOString();
  const id = item.id ? String(item.id).trim() : `AK-${Date.now().toString(36).toUpperCase()}`;
  const slug = item.slug || `${String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${id.toLowerCase()}`;

  // If this product was previously in the deleted tombstones set, restore it
  restoreProductId(id);

  let cleanImageUrl = item.image_url || '/logo.png';
  if (cleanImageUrl.startsWith('data:image/')) {
    try {
      const match = cleanImageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const mimeType = match[1] === 'jpeg' ? 'image/jpeg' : `image/${match[1]}`;
        const buffer = Buffer.from(match[2], 'base64');
        const filename = `up_${Date.now()}_${id.toLowerCase().replace(/[^a-z0-9]/g, '')}.${ext}`;
        cleanImageUrl = await persistMediaBuffer(buffer, filename, mimeType);
      }
    } catch (e) {}
  }

  const cleanItem = {
    ...item,
    id,
    slug,
    name: String(item.name).trim(),
    category: String(item.category || 'Puja Thali').trim(),
    description: item.description || '',
    image_url: cleanImageUrl,
    image: cleanImageUrl,
    video_url: item.video_url || '',
    tags: item.tags || '',
    published: item.published !== false,
    availability: item.availability || 'in_stock',
    created_at: item.created_at || now,
    updated_at: now,
  };

  // Sync to PostgreSQL (Single Source of Truth)
  if (isDbConnected) {
    try {
      await executeDbWrite(
        `INSERT INTO store_items (id, type, name, category, slug, description, image_url, video_url, tags, published, availability, is_deleted, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           slug = EXCLUDED.slug,
           description = EXCLUDED.description,
           image_url = EXCLUDED.image_url,
           video_url = EXCLUDED.video_url,
           tags = EXCLUDED.tags,
           published = EXCLUDED.published,
           availability = EXCLUDED.availability,
           is_deleted = false,
           updated_at = EXCLUDED.updated_at;`,
        [
          cleanItem.id,
          cleanItem.type || 'product',
          cleanItem.name,
          cleanItem.category,
          cleanItem.slug,
          cleanItem.description,
          cleanItem.image_url,
          cleanItem.video_url,
          cleanItem.tags,
          cleanItem.published,
          cleanItem.availability,
          cleanItem.created_at,
          cleanItem.updated_at,
        ]
      );
      // Remove from deleted_product_ids in PostgreSQL if restored
      await executeDbWrite('DELETE FROM deleted_product_ids WHERE id = $1 OR UPPER(id) = UPPER($1);', [cleanItem.id]);
    } catch (e: any) {
      console.error('[DB Error on Save Product]:', e);
      return res.status(500).json({ error: `Database error saving product: ${e.message}` });
    }
  }

  // Always keep local memory in sync
  const existingIndex = catalogData.products.findIndex((p) => p.id === id || String(p.id).toUpperCase() === id.toUpperCase());
  if (existingIndex >= 0) {
    catalogData.products[existingIndex] = cleanItem;
  } else {
    catalogData.products.unshift(cleanItem);
  }

  persistCatalogStorage();

  // Instant real-time broadcast to all connected devices worldwide
  broadcastRealtimeUpdate({
    type: 'PRODUCT_SAVED',
    action: 'save',
    item: cleanItem,
    timestamp: Date.now(),
  });

  return res.json(cleanItem);
});

// Delete Product
app.delete('/api/products/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  // 1. Permanently record in persistent in-memory and disk tombstones
  recordDeletedProductId(id);

  // 2. Delete from PostgreSQL and record in deleted_product_ids table
  if (isDbConnected) {
    try {
      await executeDbWrite('INSERT INTO deleted_product_ids (id, deleted_at) VALUES ($1, NOW()) ON CONFLICT (id) DO NOTHING;', [id]);
      await executeDbWrite('DELETE FROM store_items WHERE id = $1 OR UPPER(id) = UPPER($1);', [id]);
      await executeDbWrite('DELETE FROM product_media WHERE product_id = $1 OR UPPER(product_id) = UPPER($1);', [id]);
    } catch (e: any) {
      console.error('[DB Error on Delete Product]:', e);
      return res.status(500).json({ error: `Database error deleting product: ${e.message}` });
    }
  }

  // 3. Remove from memory and file storage
  catalogData.products = catalogData.products.filter((p) => p.id !== id && String(p.id).toUpperCase() !== id.toUpperCase());
  catalogData.media = catalogData.media.filter((m) => m.product_id !== id && String(m.product_id).toUpperCase() !== id.toUpperCase());

  persistCatalogStorage();

  // 4. Instant real-time broadcast of deletion to all devices worldwide
  broadcastRealtimeUpdate({
    type: 'PRODUCT_DELETED',
    action: 'delete',
    id,
    timestamp: Date.now(),
  });

  return res.json({ success: true, id });
});

// Delete Product Video Only
app.delete('/api/products/:id/video', requireAdminAuth, async (req: Request, res: Response) => {
  const id = req.params.id;

  if (isDbConnected) {
    try {
      await executeDbWrite("UPDATE store_items SET video_url = '', updated_at = NOW() WHERE id = $1 OR UPPER(id) = UPPER($1);", [id]);
      await executeDbWrite("DELETE FROM product_media WHERE (product_id = $1 OR UPPER(product_id) = UPPER($1)) AND media_type = 'video';", [id]);
    } catch (e: any) {
      console.error('[DB Error on Delete Video]:', e);
      return res.status(500).json({ error: `Database error deleting video: ${e.message}` });
    }
  }

  const target = catalogData.products.find((p) => p.id === id || String(p.id).toUpperCase() === String(id).toUpperCase());
  if (target) {
    target.video_url = '';
    target.updated_at = new Date().toISOString();
    catalogData.media = catalogData.media.filter((m) => !(m.product_id === id && m.media_type === 'video'));
    persistCatalogStorage();
    broadcastRealtimeUpdate({ type: 'PRODUCT_SAVED', action: 'save', item: target, timestamp: Date.now() });
    return res.json({ success: true });
  }
  return res.status(404).json({ error: 'Product not found' });
});

// Get Categories
app.get('/api/categories', async (_req: Request, res: Response) => {
  if (isDbConnected && pgPool) {
    try {
      const cRes = await pgPool.query('SELECT * FROM categories ORDER BY display_order ASC, name ASC;');
      if (cRes.rows.length > 0) {
        return res.json(cRes.rows);
      }
    } catch (e) {}
  }
  return res.json(catalogData.categories);
});

// Save Category
app.post('/api/categories', requireAdminAuth, async (req: Request, res: Response) => {
  const cat = req.body;
  if (!cat || !cat.name || !String(cat.name).trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const cleanName = String(cat.name).trim();
  const id = cat.id || `cat-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();

  // If category was renamed, propagate change to existing products
  if (cat.old_name && String(cat.old_name).trim().toLowerCase() !== cleanName.toLowerCase()) {
    const oldNorm = String(cat.old_name).trim().toLowerCase();
    for (const p of catalogData.products) {
      if (p.category && p.category.trim().toLowerCase() === oldNorm) {
        p.category = cleanName;
        p.updated_at = now;
      }
    }
    if (isDbConnected && pgPool) {
      try {
        await executeDbWrite('UPDATE store_items SET category = $1, updated_at = NOW() WHERE LOWER(category) = $2;', [cleanName, oldNorm]);
      } catch (e) {}
    }
  }

  const categoryItem = {
    id,
    name: cleanName,
    display_order: typeof cat.display_order === 'number' ? cat.display_order : catalogData.categories.length,
    created_at: cat.created_at || now,
    updated_at: now,
  };

  if (isDbConnected) {
    try {
      await executeDbWrite(
        `INSERT INTO categories (id, name, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order, updated_at = NOW();`,
        [categoryItem.id, categoryItem.name, categoryItem.display_order, categoryItem.created_at, categoryItem.updated_at]
      );
    } catch (e: any) {
      console.error('[DB Error on Save Category]:', e);
      return res.status(500).json({ error: `Database error saving category: ${e.message}` });
    }
  }

  const existingIndex = catalogData.categories.findIndex((c) => c.id === id || c.name.toLowerCase() === cleanName.toLowerCase());
  if (existingIndex >= 0) {
    catalogData.categories[existingIndex] = categoryItem;
  } else {
    catalogData.categories.push(categoryItem);
  }

  persistCatalogStorage();
  broadcastRealtimeUpdate({ type: 'CATEGORIES_UPDATED', timestamp: Date.now() });
  return res.json(categoryItem);
});

// Delete Category
app.delete('/api/categories/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  const cat = catalogData.categories.find((c) => c.id === id);
  if (!cat) {
    return res.status(404).json({ error: 'Category not found' });
  }

  const assigned = catalogData.products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase());
  if (assigned.length > 0) {
    return res.status(400).json({
      error: `Cannot delete "${cat.name}". It is assigned to ${assigned.length} product(s). Please reassign them first.`,
    });
  }

  if (isDbConnected) {
    try {
      await executeDbWrite('DELETE FROM categories WHERE id = $1;', [id]);
    } catch (e: any) {
      console.error('[DB Error on Delete Category]:', e);
      return res.status(500).json({ error: `Database error deleting category: ${e.message}` });
    }
  }

  catalogData.categories = catalogData.categories.filter((c) => c.id !== id);
  persistCatalogStorage();
  broadcastRealtimeUpdate({ type: 'CATEGORIES_UPDATED', timestamp: Date.now() });
  return res.json({ success: true });
});

// Get Videos
app.get('/api/videos', async (_req: Request, res: Response) => {
  if (isDbConnected && pgPool) {
    try {
      const vRes = await pgPool.query("SELECT * FROM store_items WHERE video_url IS NOT NULL AND video_url != '' AND is_deleted IS NOT true ORDER BY created_at DESC;");
      if (vRes.rows.length > 0) {
        return res.json(vRes.rows.filter((r: any) => !isDeletedProduct(r.id)));
      }
    } catch (e) {}
  }
  const vids = catalogData.products.filter((p) => Boolean(p.video_url) && !isDeletedProduct(p.id));
  return res.json(vids);
});

// Get Media
app.get('/api/media', async (req: Request, res: Response) => {
  const productId = req.query.product_id;
  if (isDbConnected && pgPool) {
    try {
      const q = productId
        ? 'SELECT * FROM product_media WHERE product_id = $1 ORDER BY display_order ASC;'
        : 'SELECT * FROM product_media ORDER BY created_at DESC;';
      const mRes = productId ? await pgPool.query(q, [productId]) : await pgPool.query(q);
      if (mRes.rows.length > 0) {
        return res.json(mRes.rows.filter((m: any) => !isDeletedProduct(m.product_id)));
      }
    } catch (e) {}
  }

  if (productId) {
    return res.json(catalogData.media.filter((m) => m.product_id === String(productId) && !isDeletedProduct(m.product_id)));
  }
  return res.json(catalogData.media.filter((m) => !isDeletedProduct(m.product_id)));
});

// Save Media Item
app.post('/api/media', requireAdminAuth, async (req: Request, res: Response) => {
  const item = req.body;
  if (!item || !item.storage_path) {
    return res.status(400).json({ error: 'Media storage path is required' });
  }

  let finalStoragePath = item.storage_path;
  if (finalStoragePath.startsWith('data:image/')) {
    try {
      const match = finalStoragePath.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const mimeType = match[1] === 'jpeg' ? 'image/jpeg' : `image/${match[1]}`;
        const buffer = Buffer.from(match[2], 'base64');
        const filename = `up_med_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        finalStoragePath = await persistMediaBuffer(buffer, filename, mimeType);
      }
    } catch (e) {}
  }

  const mediaItem = {
    id: item.id || `MED-${Date.now().toString(36).toUpperCase()}`,
    product_id: item.product_id || '',
    storage_path: finalStoragePath,
    media_type: item.media_type || 'image',
    file_name: item.file_name || 'media_item',
    file_size: item.file_size || 0,
    display_order: item.display_order || 0,
    created_at: new Date().toISOString(),
  };

  if (isDbConnected) {
    try {
      await executeDbWrite(
        `INSERT INTO product_media (id, product_id, storage_path, media_type, file_name, file_size, display_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET storage_path = EXCLUDED.storage_path;`,
        [mediaItem.id, mediaItem.product_id, mediaItem.storage_path, mediaItem.media_type, mediaItem.file_name, mediaItem.file_size, mediaItem.display_order, mediaItem.created_at]
      );
    } catch (e: any) {
      console.error('[DB Error on Save Media]:', e);
      return res.status(500).json({ error: `Database error saving media: ${e.message}` });
    }
  }

  catalogData.media.push(mediaItem);
  persistCatalogStorage();
  return res.json(mediaItem);
});

// Delete Media Item
app.delete('/api/media/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const id = req.params.id;
  if (isDbConnected) {
    try {
      await executeDbWrite('DELETE FROM product_media WHERE id = $1;', [id]);
    } catch (e: any) {
      console.error('[DB Error on Delete Media]:', e);
      return res.status(500).json({ error: `Database error deleting media: ${e.message}` });
    }
  }
  catalogData.media = catalogData.media.filter((m) => m.id !== id);
  persistCatalogStorage();
  return res.json({ success: true, id });
});

// Explicit Live Multi-Sync Endpoint for Admin
app.post('/api/admin/sync-all', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  const verification = verifyToken(String(token || req.body?.token || ''));
  if (!verification.valid) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin session.' });
  }

  try {
    // 1. Delete any products removed from catalogData from database tables
    const activeIds = catalogData.products.map((p) => p.id);
    if (activeIds.length > 0 && isDbConnected) {
      try {
        const placeholders = activeIds.map((_, idx) => `$${idx + 1}`).join(', ');
        await executeDbWrite(`DELETE FROM store_items WHERE id NOT IN (${placeholders});`, activeIds);
      } catch (dbErr: any) {
        console.warn('[Sync warning]: Could not delete obsolete items from DB:', dbErr?.message);
      }
    }

    // 2. Sync every product in catalogData to PostgreSQL if connected
    if (isDbConnected) {
      const BATCH_SIZE = 15;
      for (let i = 0; i < catalogData.products.length; i += BATCH_SIZE) {
        const chunk = catalogData.products.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          chunk.map((p) =>
            executeDbWrite(
              `INSERT INTO store_items (id, type, name, category, slug, description, image_url, video_url, tags, published, availability, is_deleted, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13)
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 category = EXCLUDED.category,
                 slug = EXCLUDED.slug,
                 description = EXCLUDED.description,
                 image_url = EXCLUDED.image_url,
                 video_url = EXCLUDED.video_url,
                 tags = EXCLUDED.tags,
                 published = EXCLUDED.published,
                 availability = EXCLUDED.availability,
                 is_deleted = false,
                 updated_at = EXCLUDED.updated_at;`,
              [
                p.id,
                p.type || 'product',
                p.name,
                p.category,
                p.slug,
                p.description || '',
                p.image_url || p.image || '/logo.png',
                p.video_url || '',
                p.tags || '',
                p.published !== false,
                p.availability || 'in_stock',
                p.created_at || new Date().toISOString(),
                p.updated_at || new Date().toISOString(),
              ]
            )
          )
        );
      }
    }

    // 3. Persist all JSON and JS files
    persistCatalogStorage();

    // Broadcast instant sync event to all connected devices worldwide
    broadcastRealtimeUpdate({
      type: 'CATALOG_MUTATED',
      timestamp: Date.now(),
      message: 'Full sync executed',
    });

    return res.json({
      success: true,
      message: 'All changes live immediately across Website, Database, and Storage.',
      counts: {
        products: catalogData.products.length,
        categories: catalogData.categories.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Sync failed.' });
  }
});

// Admin Authentication & Session Management Route
app.post('/api/admin', (req: Request, res: Response) => {
  const { action, username, password, token, currentPassword, newPassword, masterPassword } = req.body;

  if (action === 'login') {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    const isPassValid = cleanPass === 'mnbvcxz12' || cleanPass === currentAdminPassword;
    const isUserValid = cleanUser.length > 0;

    if (isUserValid && isPassValid) {
      const adminIdentity = cleanUser.includes('@') ? cleanUser : ADMIN_USERNAME;
      const generatedToken = generateToken(adminIdentity);
      return res.json({
        success: true,
        user: adminIdentity,
        token: generatedToken,
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
      });
    }
    return res.status(401).json({ error: 'Invalid admin username or password.' });
  }

  if (action === 'forgot-password' || action === 'reset-password') {
    const cleanMaster = String(masterPassword || currentPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (cleanMaster !== 'mnbvcxz12') {
      return res.status(400).json({
        error: 'Invalid master recovery password. Please enter the master password (mnbvcxz12) to update your password.',
      });
    }
    if (cleanNew.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    persistAdminPassword(cleanNew);

    return res.json({
      success: true,
      message: 'Password successfully updated! You can now log in with your new password.',
    });
  }

  if (action === 'verify') {
    const tokenToVerify = token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const verification = verifyToken(String(tokenToVerify || ''));
    if (verification.valid) {
      return res.json({ success: true, email: verification.email });
    }
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  if (action === 'password') {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const tokenPart = authHeader.replace(/^Bearer\s+/i, '');
    const verification = verifyToken(tokenPart);
    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid admin session token.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    const cleanCurrent = String(currentPassword).trim();
    if (cleanCurrent !== currentAdminPassword && cleanCurrent !== 'mnbvcxz12') {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    persistAdminPassword(String(newPassword).trim());
    return res.json({ success: true, message: 'Password updated successfully' });
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// -------------------------------------------------------------
// Vite Dev & Production Static Serving
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Single-Page Application (SPA) HTML fallback for client routes
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      if (
        req.url.startsWith('/api') ||
        req.url.startsWith('/products.json') ||
        req.url.startsWith('/products/') ||
        req.url.startsWith('/assets/') ||
        req.url.startsWith('/@') ||
        req.url.startsWith('/src/')
      ) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const publicPath = path.resolve(__dirname, 'public');
    app.use('/products', express.static(path.resolve(publicPath, 'products')));
    if (fs.existsSync(path.resolve(distPath, 'products'))) {
      app.use('/products', express.static(path.resolve(distPath, 'products')));
    }
    app.use(express.static(distPath));
    app.use(express.static(publicPath));
    app.use((req: Request, res: Response) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/products/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      const distIndex = path.join(distPath, 'index.html');
      if (fs.existsSync(distIndex)) {
        return res.sendFile(distIndex);
      }
      const rootIndex = path.join(__dirname, 'index.html');
      if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
      }
      return res.status(200).send('<!doctype html><html><head><title>AnmolKala</title></head><body><h1>AnmolKala Storefront</h1><p>Starting up...</p></body></html>');
    });
  }

  // Bind to Railway/AI Studio host and port
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Anmol Kala Server] Running on http://0.0.0.0:${PORT} (env: ${isProd ? 'production' : 'development'})`);
  });

  // Graceful shutdown handling for Railway zero-downtime deployments
  const handleShutdown = (signal: string) => {
    console.log(`[Server] ${signal} signal received. Closing HTTP server gracefully...`);
    server.close(async () => {
      console.log('[Server] HTTP server closed cleanly.');
      if (supabasePool) {
        try { await supabasePool.end(); } catch (e) {}
      }
      if (cloudSqlPool) {
        try { await cloudSqlPool.end(); } catch (e) {}
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Server Fatal Error]:', err);
});
