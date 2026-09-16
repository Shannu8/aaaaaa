import fs from 'fs';

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf8');
  const match = content.match(/^GEMINI_API_KEY=(.+)$/m);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error('No GEMINI_API_KEY found');
  process.exit(1);
}

async function listModels(version) {
  console.log(`\nFetching models for API version: ${version}...`);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`);
    const data = await res.json();
    if (data.error) {
      console.log(`Error listing ${version} models:`, data.error.message);
      return;
    }
    console.log(`Found ${data.models?.length || 0} models for ${version}:`);
    for (const m of data.models || []) {
      const methods = m.supportedGenerationMethods || [];
      const name = m.name || '';
      console.log(`- ${name} | Methods: ${methods.join(', ')}`);
    }
  } catch (err) {
    console.error(`Fetch error for ${version}:`, err.message);
  }
}

async function run() {
  await listModels('v1beta');
  await listModels('v1alpha');
}

run();
