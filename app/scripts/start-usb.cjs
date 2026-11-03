const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

// Match the Metro port used by the installed USB debug APK. Override if rebuilt.
const port = process.env.LIFEOS_METRO_PORT || '8081';
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error('LIFEOS_METRO_PORT must be a port from 1024 to 65535.');
}
const adb = process.platform === 'win32' ? 'adb.exe' : 'adb';
for (const forwardedPort of new Set(['3000', port])) {
  const result = spawnSync(adb, ['reverse', `tcp:${forwardedPort}`, `tcp:${forwardedPort}`], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('Connect and unlock one Android device, then approve USB debugging.');
    process.exit(1);
  }
}
const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --dns-result-order=ipv4first`.trim(),
};
console.log(`Starting LifeOS USB development on port ${port}. Keep this terminal open.`);
const server = spawn(process.execPath, [cli, 'start', '--localhost', '--port', port, ...(process.argv.includes('--clear') ? ['--clear'] : [])], { stdio: 'inherit', env });
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code) => { process.exitCode = code ?? 1; });
