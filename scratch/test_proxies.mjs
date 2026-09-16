import http from 'http';

function checkUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });
}

async function run() {
  console.log('Testing /api/google/text-search on http://localhost:4173...');
  const res = await checkUrl('http://localhost:4173/api/google/text-search?q=New+York&lat=40.7128&lon=-74.0060');
  console.log('Response HTTP status:', res.status);
  try {
    const json = JSON.parse(res.data);
    console.log('Places text-search places count:', json.places?.length || 0);
    if (json.places?.[0]) {
      console.log('First place:', json.places[0].name, json.places[0].latitude, json.places[0].longitude);
    } else {
      console.log('Raw output:', res.data);
    }
  } catch (e) {
    console.log('Raw output:', res.data);
  }
}

run();
