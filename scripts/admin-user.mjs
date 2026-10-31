import { stdin, stdout } from 'node:process';
import { adminOptionsFromEnv, createAdminAuth } from '../server/admin-auth.mjs';

const usage =
  'Uso: node --env-file-if-exists=.env scripts/admin-user.mjs create EMAIL ROLE NAME | role EMAIL ROLE | disable EMAIL | enable EMAIL | revoke EMAIL | reset-mfa EMAIL | reset-password EMAIL';
const [command, email, role, ...nameParts] = process.argv.slice(2);
if (
  !['create', 'role', 'disable', 'enable', 'revoke', 'reset-mfa', 'reset-password'].includes(
    command,
  ) ||
  !email ||
  (command === 'create' && (!role || !nameParts.length)) ||
  (command === 'role' && (!role || nameParts.length)) ||
  (!['create', 'role'].includes(command) && role !== undefined)
) {
  console.error(usage);
  process.exitCode = 1;
} else {
  let authentication;
  try {
    const options = adminOptionsFromEnv();
    if (!options)
      throw new Error('Set ADMIN_ENABLED=true and the administrative environment variables first.');
    authentication = createAdminAuth(options);
    await authentication.ready;
    let password;
    if (['create', 'reset-password'].includes(command)) {
      // The password is never a process argument, env variable, or log entry.
      if (!stdin.isTTY || !stdout.isTTY)
        throw new Error(
          'Run this command from an interactive terminal to enter the password without exposing it in process arguments.',
        );
      stdout.write('Contraseña (15–128 caracteres): ');
      stdin.setRawMode(true);
      stdin.resume();
      password = await new Promise((accept, reject) => {
        let value = '';
        const onData = (chunk) => {
          for (const char of chunk.toString()) {
            if (char === '\u0003') {
              cleanup();
              reject(new Error('Canceled.'));
              return;
            }
            if (char === '\r' || char === '\n') {
              cleanup();
              accept(value);
              return;
            }
            if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
            else if (char >= ' ' && value.length < 129) value += char;
          }
        };
        const cleanup = () => {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
        };
        stdin.on('data', onData);
      });
    }
    const result =
      command === 'create'
        ? await authentication.provision({ email, role, name: nameParts.join(' '), password })
        : await authentication.changeAccess(email, {
            ...(command === 'role' ? { role } : {}),
            ...(command === 'disable' ? { disabled: true } : {}),
            ...(command === 'enable' ? { disabled: false } : {}),
            ...(command === 'reset-mfa' ? { resetMfa: true } : {}),
            ...(command === 'reset-password' ? { password } : {}),
          });
    console.log(JSON.stringify({ status: 'ok', action: command, user: result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    authentication?.close();
  }
}
