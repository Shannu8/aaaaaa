import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Check Windows user and machine registry for GEMINI_API_KEY
function getWinRegKey() {
  for (const scope of ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']) {
    try {
      const out = execSync(`reg query "${scope}" /v GEMINI_API_KEY 2>nul`, { encoding: 'utf8' });
      const m = out.match(/GEMINI_API_KEY\s+REG_SZ\s+(\S.*)/);
      if (m) {
        const val = m[1].trim();
        if (val.length > 0) return val;
      }
    } catch {
      /* not found in this scope */
    }
  }
  return null;
}

const winKey = getWinRegKey();

if (!winKey) {
  console.log('GEMINI_API_KEY: NOT FOUND in Windows User or Machine environment variables.');
  console.log('ACTION NEEDED: Set GEMINI_API_KEY in Windows User environment variables or in .env file.');
  process.exit(1);
}

console.log('GEMINI_API_KEY found in Windows environment. Length:', winKey.length);

// Write it safely into .env
const envPath = path.resolve('.env');
let envContent = fs.readFileSync(envPath, 'utf8');

if (/^GEMINI_API_KEY=.*$/m.test(envContent)) {
  envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${winKey}`);
} else {
  envContent += `\nGEMINI_API_KEY=${winKey}\n`;
}

fs.writeFileSync(envPath, envContent, 'utf8');
console.log('.env updated with GEMINI_API_KEY. Value never printed.');

// Verify .env now has a non-empty value
const updated = fs.readFileSync(envPath, 'utf8');
const checkMatch = updated.match(/^GEMINI_API_KEY=(.+)$/m);
const hasValue = checkMatch && checkMatch[1].trim().length > 0;
console.log('.env GEMINI_API_KEY non-empty:', hasValue);
