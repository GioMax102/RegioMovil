import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { trainArtifact } from './model.mjs';

const directory = fileURLToPath(new URL('../models/', import.meta.url));
await mkdir(directory, { recursive: true });
const artifact = trainArtifact();
await writeFile(`${directory}/artifact.json`, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Saved ${artifact.version}: ${artifact.sampleCount} synthetic samples; no observed passenger data.`);
for (const [target, model] of Object.entries(artifact.models)) {
  console.log(`${target}: held-out synthetic MAE ${model.evaluation.model.mae.toFixed(3)}, baseline MAE ${model.evaluation.baseline.mae.toFixed(3)}`);
}
