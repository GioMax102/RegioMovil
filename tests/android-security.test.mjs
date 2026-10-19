import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source contracts cover native security boundaries without pretending to run
// Android's lifecycle or GPS. Gradle and physical-device checks remain separate.
const activity = await readFile(new URL('../android/app/src/main/java/mx/regiomovil/app/MainActivity.java', import.meta.url), 'utf8');
const location = await readFile(new URL('../android/app/src/main/java/mx/regiomovil/app/RegioLocationPlugin.java', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const config = await readFile(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const sharedPaths = await readFile(new URL('../android/app/src/main/res/xml/file_paths.xml', import.meta.url), 'utf8');

function method(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing native contract: ${signature}`);
  const opening = source.indexOf('{', start);
  let depth = 1;
  let end = opening + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(opening + 1, end - 1);
}

test('station launch applies both on cold start and reused activity without accepting an external URL', () => {
  const cold = method(activity, 'void onCreate(Bundle savedInstanceState)');
  const reused = method(activity, 'void onNewIntent(Intent intent)');
  assert.ok(cold.indexOf('super.onCreate(savedInstanceState)') < cold.indexOf('applyStationMode(getIntent())'));
  assert.ok(cold.includes('applyStationMode(getIntent())'));
  assert.ok(reused.includes('applyStationMode(intent)'));
  const launch = method(activity, 'void applyStationMode(Intent intent)');
  assert.ok(launch.includes('Uri.parse(bridge.getAppUrl())'));
  assert.ok(launch.includes('station.matches("[a-z0-9-]{1,64}")'));
  assert.ok(launch.includes('url.appendQueryParameter("station", station)'));
  assert.doesNotMatch(activity, /getData\(|getDataString\(|getStringExtra\("(?:url|uri|server)"/);
});

test('foreground guards precede native GPS registration and callback delivery after a pause', () => {
  const start = method(location, 'void start(PluginCall call)');
  assert.ok(start.includes('if (!foreground)'));
  assert.ok(start.indexOf('if (!foreground)') < start.indexOf('getSystemService'));
  const complete = method(location, 'void complete(Location location)');
  assert.ok(complete.includes('if (!foreground || pending == null'));
  assert.ok(complete.indexOf('!foreground') < complete.indexOf('call.resolve'));
  const watch = method(location, 'void startWatch(PluginCall call)');
  assert.ok(watch.includes('if (!foreground || watchCall == null'));
  assert.ok(watch.indexOf('!foreground || watchCall == null') < watch.indexOf('watchCall.resolve(result)'));
  assert.ok(start.includes('cachedAge >= 0'));
  assert.ok(complete.includes('age < 0'));
  const pause = method(location, 'void handleOnPause()');
  assert.ok(pause.indexOf('leaveForeground()') < pause.indexOf('main.post'));
  assert.ok(pause.includes('endWatch('));
  const stop = method(location, 'void endWatch(String message, String code)');
  assert.ok(stop.includes('manager.removeUpdates(watchListener)'));
  assert.ok(stop.includes('bridge.releaseCall(call)'));
  assert.doesNotMatch(location, /android\.util\.Log|java\.net\.|java\.io\.|SharedPreferences/);
});

test('release app uses local assets, HTTPS and foreground-only optional GPS without automatic backup', () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android\.hardware\.location\.gps" android:required="false"/);
  assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
  assert.match(config, /allowMixedContent:\s*false/);
  assert.doesNotMatch(config.replace(/\/\/[^\n]*/g, ''), /server\s*:\s*\{|allowNavigation\s*:/);
  assert.doesNotMatch(sharedPaths, /<(?:external|root|files)-path/);
  assert.match(sharedPaths, /<cache-path name="shared_images" path="shared\/"/);
});
