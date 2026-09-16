import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Search broadly for any key-like value set in known env variables
const candidates = [
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_KEY',
  'GOOGLE_GEMINI_KEY',
];

function checkProcessEnv() {
  for (const name of candidates) {
    const val = (process.env[name] || '').trim();
    if (val.length > 10) return { name, val };
  }
  return null;
}

function getWinAllUserVars() {
  const found = [];
  try {
    const out = execSync('reg query HKCU\\Environment', { encoding: 'utf8' });
    console.log('--- HKCU Environment variables (names only) ---');
    const lines = out.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s{4}(\S+)\s+REG_SZ\s+(.*)$/);
      if (m) {
        const name = m[1].trim();
        const val = m[2].trim();
        console.log(`  ${name}: length ${val.length}`);
        if (val.length > 10) found.push({ scope: 'HKCU', name, val });
      }
    }
  } catch {
    console.log('Failed to read HKCU Environment');
  }
  return found;
}

console.log('=== ENVIRONMENT DIAGNOSTIC ===');
const fromProcess = checkProcessEnv();
if (fromProcess) {
  console.log(`Found in process.env: ${fromProcess.name}, length: ${fromProcess.val.length}`);
} else {
  console.log('Not found in process.env (any candidate)');
}

const winVars = getWinAllUserVars();
const geminiWin = winVars.find(v => candidates.includes(v.name));
if (geminiWin) {
  console.log(`Found in Windows registry: ${geminiWin.name}, length: ${geminiWin.val.length}`);
}
