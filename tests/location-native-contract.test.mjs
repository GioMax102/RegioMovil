import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Boundary contracts only: these do not claim to exercise Android's GPS or lifecycle.
const source = await readFile(
  new URL(
    '../android/app/src/main/java/mx/regiomovil/app/RegioLocationPlugin.java',
    import.meta.url,
  ),
  'utf8',
);
function method(signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1);
  const open = source.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(open + 1, end - 1);
}

test('strict native reads reject revoked access before a permission request and recheck before OS acquisition', () => {
  const read = method('void getCurrentPosition(PluginCall call)');
  const strict = read.indexOf('!call.getBoolean("requestPermission", true)');
  assert.ok(strict >= 0 && strict < read.indexOf('requestPermissionForAliases'));
  assert.match(
    read.slice(strict, read.indexOf('requestPermissionForAliases')),
    /call\.reject[\s\S]*return;/,
  );
  const start = method('void start(PluginCall call)');
  assert.ok(start.indexOf('getPermissionState("coarse")') < start.indexOf('getSystemService'));
  assert.doesNotMatch(start, /requestPermissionForAlias/);
  assert.doesNotMatch(
    source,
    /public void checkPermissions\(/,
    'Use the non-requesting inherited Capacitor API.',
  );
});

test('native single fixes and guidance samples carry the provider timestamp, with request-scoped cancellation', () => {
  const complete = method('void complete(Location location)');
  assert.match(complete, /result\.put\("timestamp", location\.getTime\(\)\)/);
  assert.doesNotMatch(source, /System\.currentTimeMillis\(\)/);
  assert.match(
    method('void cancelCurrentPosition(PluginCall call)'),
    /id\.equals\(pending\.getString\("requestId"\)\)/,
  );
  assert.match(
    method('void start(PluginCall call)'),
    /if \(pending == call\) complete\(location\)/,
  );
  assert.match(method('void cleanup()'), /releasePositionId\(pending\)/);
  assert.match(
    method('void handleOnStop()'),
    /cancelledPositionIds\.addAll\(awaitingPositionIds\)/,
  );
  assert.doesNotMatch(
    method('void leaveForeground()'),
    /cancelledPositionIds\.addAll/,
    'A permission dialog may pause the activity; only background stop invalidates that pending consent.',
  );
});
