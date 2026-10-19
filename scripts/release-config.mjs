import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Read the values actually used by Gradle; never invent release metadata. */
export function readReleaseConfig(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const gradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const version = gradle.match(/\bversionName\s+"([^"]+)"/)?.[1];
  const versionCode = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  const appId = gradle.match(/\bapplicationId\s+"([^"]+)"/)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || version !== manifest.version)
    throw new Error('La versión de package.json y versionName de Android deben coincidir.');
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || !appId)
    throw new Error('Android necesita applicationId y versionCode válidos.');
  return { appId, version, versionCode };
}
