const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const background = process.argv.includes('--background');

function getFreePort(start = 5173, attempts = 30) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port >= start + attempts) return reject(new Error('No free Vite port found'));
      const server = net.createServer();
      server.unref();
      server.once('error', () => { port += 1; tryPort(); });
      server.listen({ host: '127.0.0.1', port }, () => {
        const chosen = port;
        server.close(() => resolve(chosen));
      });
    };
    tryPort();
  });
}

function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolve();
      } catch {}
      if (Date.now() - started > timeoutMs) return reject(new Error(`Vite did not start: ${url}`));
      setTimeout(tick, 250);
    };
    tick();
  });
}

(async () => {
  const port = await getFreePort(Number(process.env.ABDX_DEV_PORT || 5173));
  const url = `http://127.0.0.1:${port}`;
  const env = { ...process.env, ABDX_DEV_PORT: String(port), ABDX_DEV_URL: url };
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const electronBin = require('electron');

  console.log(`[ABDULKAREM AI X] Vite port: ${port}`);
  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'inherit' });
  let electron;

  const shutdown = () => {
    try { electron?.kill(); } catch {}
    try { vite?.kill(); } catch {}
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  vite.on('exit', (code) => {
    if (!electron) process.exit(code || 1);
  });

  await waitForHttp(url);
  electron = spawn(electronBin, background ? ['.','--background'] : ['.'], { cwd: root, env, stdio: 'inherit' });
  electron.on('exit', (code) => { shutdown(); process.exit(code || 0); });
})().catch(err => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
