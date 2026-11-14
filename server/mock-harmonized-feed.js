const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Local integration fixture only; reread on every request to exercise updates.
const file = path.join(__dirname, 'fixtures', 'harmonized.csv');
http.createServer((req, res) => {
  if (req.url !== '/results.csv') { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/csv');
  res.end(fs.readFileSync(file));
}).listen(5051, '127.0.0.1', () => console.log('Illustrative integration feed: http://127.0.0.1:5051/results.csv'));
