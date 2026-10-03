// Minimal JWKS stub for load testing.
// Serves the test keypair's public JWKS at the path the backend fetches.
const http = require('http');
const fs = require('fs');

const jwks = fs.readFileSync('/jwks/jwks.json');

http.createServer((req, res) => {
  if (req.url === '/auth/v1/.well-known/jwks.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(jwks);
  } else if (req.url === '/health') {
    res.writeHead(200); res.end('ok');
  } else {
    res.writeHead(404); res.end('not found');
  }
}).listen(8080, () => console.log('JWKS stub on :8080'));
