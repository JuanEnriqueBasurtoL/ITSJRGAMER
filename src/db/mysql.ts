import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const dbConfig = {
  host: process.env['DB_HOST'] || '127.0.0.1',
  port: Number(process.env['DB_PORT'] || '3306'),
  user: process.env['DB_USER'] || 'root',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'itsjrgamer_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

export const pool = mysql.createPool(dbConfig);

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toDataUrl(mimeType: string | null | undefined, buffer: Buffer | null | undefined): string | null {
  if (!mimeType || !buffer) {
    return null;
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function dataUrlToBuffer(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function ensureRole(roleName: string): Promise<number> {
  const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT role_id FROM roles WHERE role_name = ? LIMIT 1',
    [roleName],
  );

  if (existingRows.length) {
    return Number(existingRows[0]['role_id']);
  }

  const [result] = await pool.query<mysql.ResultSetHeader>(
    'INSERT INTO roles (role_name, role_description) VALUES (?, ?)',
    [roleName, `${roleName} role`],
  );

  return Number(result.insertId);
}

export async function ensureCareer(careerName: string | null | undefined): Promise<number | null> {
  const normalized = careerName?.trim();

  if (!normalized) {
    return null;
  }

  const [existingRows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT career_id FROM careers WHERE career_name = ? LIMIT 1',
    [normalized],
  );

  if (existingRows.length) {
    return Number(existingRows[0]['career_id']);
  }

  const [result] = await pool.query<mysql.ResultSetHeader>(
    'INSERT INTO careers (career_name, is_active) VALUES (?, 1)',
    [normalized],
  );

  return Number(result.insertId);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split(':');

  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(hash, 'hex');

  if (derived.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derived, storedBuffer);
}
