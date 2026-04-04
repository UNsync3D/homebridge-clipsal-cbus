/**
 * Homebridge UI Custom Server
 * Tests connectivity to the Clipsal unit via TCP port 10001.
 */

const net = require('net');

module.exports = (api) => {

  api.onRequest(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/test-connection') {
      res.writeHead(404);
      return res.end();
    }

    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', async () => {
      try {
        const { host } = JSON.parse(body);
        const result = await testTCP(host, 10001);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: result }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: e.message }));
      }
    });
  });

};

function testTCP(host, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timed out — check IP address'));
    }, 4000);

    client.connect(port, host, () => {
      // Send a get command as a test
      client.write('get //HOME/0/56/1\n');
    });

    client.on('data', (data) => {
      clearTimeout(timeout);
      client.destroy();
      resolve(`Connected! Response: ${data.toString().trim()}`);
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Could not connect: ${err.message}`));
    });

    client.on('close', () => {
      clearTimeout(timeout);
      resolve('Connected to Clipsal unit successfully');
    });
  });
}
