import { loadEnv } from 'vite';
import path from 'node:path';

const loaded = loadEnv('', process.cwd(), '');
const key = (process.env.GEMINI_API_KEY || loaded.GEMINI_API_KEY || '').trim();

const isConfigured = key.length > 0;
const keyLength = key.length;

console.log(`GEMINI_API_KEY configured: ${isConfigured}`);
console.log(`Key length: ${keyLength}`);
