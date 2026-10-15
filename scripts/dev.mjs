import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], {
    stdio: 'inherit',
  }),
];
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    children.forEach((child) => child.kill(signal));
    process.exit(0);
  });
children.forEach((child) =>
  child.on('exit', (code) => {
    if (code) {
      children.forEach((other) => other.kill());
      process.exit(code);
    }
  }),
);
