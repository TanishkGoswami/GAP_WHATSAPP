import { execSync } from 'node:child_process';

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const port = toInt(process.argv[2] || process.env.PORT, 3001);

function getWindowsPidsForPort(listenPort) {
  try {
    // netstat output examples:
    // TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       17776
    // TCP    [::]:3001              [::]:0                 LISTENING       17776
    const out = execSync(`netstat -ano -p tcp | findstr :${listenPort}`, {
      shell: 'cmd.exe',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();

    const pids = new Set();
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!/\bLISTENING\b/i.test(line)) continue;
      const parts = line.split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killWindowsPid(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, {
      shell: 'cmd.exe',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (process.platform !== 'win32') {
    // No-op for non-Windows environments.
    return;
  }

  const pids = getWindowsPidsForPort(port);
  if (pids.length === 0) return;

  // Best effort: kill anything listening on the port.
  // This fixes repeated EADDRINUSE when restarting dev server.
  for (const pid of pids) {
    killWindowsPid(pid);
  }
}

main();
