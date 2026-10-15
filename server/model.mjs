/** Small, portable ridge models. All training and inference data are synthetic. */
export const MODEL_VERSION = 'synthetic-ridge-1.0.0';
export const SEED = 5012026;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function seededRandom(seed = SEED) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function features(sample) {
  const { segmentsRemaining: segments, hour, peak, rain, disruption, centrality, lineSpeedFactor, serviceGap } = sample;
  return [segments, Math.sin(hour * Math.PI / 12), Math.cos(hour * Math.PI / 12), peak, rain, disruption,
    centrality, lineSpeedFactor, serviceGap, segments * rain, segments * disruption, segments * lineSpeedFactor];
}

export const FEATURE_NAMES = ['segmentsRemaining', 'hourSin', 'hourCos', 'peak', 'rain', 'disruption', 'centrality',
  'lineSpeedFactor', 'serviceGap', 'segments×rain', 'segments×disruption', 'segments×lineSpeedFactor'];

export function generateSyntheticSamples(count = 2400, seed = SEED) {
  const random = seededRandom(seed);
  const noise = () => (random() + random() + random() + random() + random() + random() - 3);
  return Array.from({ length: count }, () => {
    const hour = 5 + random() * 19;
    const sample = {
      segmentsRemaining: 1 + Math.floor(random() * 7), hour,
      peak: Number((hour >= 7 && hour < 9.5) || (hour >= 17 && hour < 20)),
      rain: Number(random() < 0.23), disruption: Number(random() < 0.12),
      centrality: random(), lineSpeedFactor: 0.82 + random() * 0.4, serviceGap: 2 + random() * 10,
    };
    const { segmentsRemaining: segments, peak, rain, disruption, centrality, lineSpeedFactor, serviceGap } = sample;
    return { ...sample,
      etaMinutes: Math.max(0.5, 0.8 + segments * lineSpeedFactor * 1.64 + peak * 1.6 + rain * 1.5 + disruption * 4.6
        + serviceGap * 0.32 + segments * rain * 0.26 + segments * disruption * 0.3 + noise() * (1.1 + rain * 0.5)),
      occupancy: clamp(15 + peak * 37 + rain * 10 + disruption * 11 + centrality * 18 + serviceGap * 1.7
        - segments * 0.8 + Math.sin(hour * Math.PI / 12) * 5 + noise() * 8, 3, 98),
    };
  });
}

function solve(matrix, vector) {
  const augmented = matrix.map((row, i) => [...row, vector[i]]);
  for (let pivot = 0; pivot < vector.length; pivot++) {
    let best = pivot;
    for (let row = pivot + 1; row < vector.length; row++) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    if (Math.abs(divisor) < 1e-12) throw new Error('Singular model matrix');
    augmented[pivot] = augmented[pivot].map(value => value / divisor);
    for (let row = 0; row < vector.length; row++) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      augmented[row] = augmented[row].map((value, col) => value - factor * augmented[pivot][col]);
    }
  }
  return augmented.map(row => row.at(-1));
}

export function fitRidge(samples, target, lambda = 2) {
  const vectors = samples.map(features);
  const means = FEATURE_NAMES.map((_, col) => vectors.reduce((sum, row) => sum + row[col], 0) / vectors.length);
  const scales = means.map((mean, col) => Math.sqrt(vectors.reduce((sum, row) => sum + (row[col] - mean) ** 2, 0) / vectors.length) || 1);
  const size = means.length + 1;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);
  for (let row = 0; row < samples.length; row++) {
    const x = [1, ...vectors[row].map((value, col) => (value - means[col]) / scales[col])];
    for (let i = 0; i < size; i++) {
      vector[i] += x[i] * samples[row][target];
      for (let j = 0; j < size; j++) matrix[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < size; i++) matrix[i][i] += lambda;
  return { target, lambda, means, scales, coefficients: solve(matrix, vector) };
}

export function predict(model, sample) {
  return model.coefficients[0] + features(sample).reduce((sum, value, i) =>
    sum + model.coefficients[i + 1] * (value - model.means[i]) / model.scales[i], 0);
}

function metrics(actual, estimated) {
  const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const mse = actual.reduce((sum, value, i) => sum + (value - estimated[i]) ** 2, 0) / actual.length;
  const variance = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0) / actual.length;
  return { mae: actual.reduce((sum, value, i) => sum + Math.abs(value - estimated[i]), 0) / actual.length,
    rmse: Math.sqrt(mse), rSquared: 1 - mse / variance };
}

export function trainArtifact() {
  const samples = generateSyntheticSamples();
  // Randomly generated order is independent of targets; split before fitting or calibration.
  const training = samples.slice(0, 1680);
  const calibration = samples.slice(1680, 2040);
  const test = samples.slice(2040);
  const models = {};
  for (const target of ['etaMinutes', 'occupancy']) {
    const model = fitRidge(training, target);
    const residuals = calibration.map(sample => Math.abs(sample[target] - predict(model, sample))).sort((a, b) => a - b);
    const radius = residuals[Math.min(residuals.length - 1, Math.ceil((residuals.length + 1) * 0.8) - 1)];
    const baselineMean = training.reduce((sum, sample) => sum + sample[target], 0) / training.length;
    const actual = test.map(sample => sample[target]);
    const estimated = test.map(sample => predict(model, sample));
    models[target] = { ...model, interval: { nominalCoverage: 0.8, absoluteResidualQuantile: radius,
      heldoutCoverage: test.filter((sample, i) => Math.abs(sample[target] - estimated[i]) <= radius).length / test.length },
      evaluation: { model: metrics(actual, estimated), baseline: metrics(actual, actual.map(() => baselineMean)), baselineType: 'training-target-mean' } };
  }
  return { version: MODEL_VERSION, seed: SEED, dataKind: 'synthetic', featureNames: FEATURE_NAMES,
    sampleCount: samples.length, split: { train: training.length, calibration: calibration.length, test: test.length }, models };
}

export function modelCard(artifact) {
  return {
    name: 'RegioMovil · demostración predictiva', version: artifact.version, mode: 'simulation',
    summary: 'Dos regresiones ridge estiman llegada y ocupación a partir de viajes generados por reglas. No utilizan GPS, validaciones, aforos ni telemetría de operadores.',
    data: { kind: 'synthetic', seed: artifact.seed, samples: artifact.sampleCount, split: artifact.split,
      geographicData: 'El catálogo de estaciones y líneas es información de referencia; las llegadas y condiciones de unidades son simuladas.' },
    method: { algorithm: 'Ridge regression', lambda: 2, features: artifact.featureNames,
      intervals: 'Intervalo nominal del 80% calibrado con residuales absolutos en 360 muestras sintéticas separadas. No implica cobertura en servicio real.',
      baseline: 'Media del objetivo calculada únicamente con el conjunto de entrenamiento.',
      reproducibility: 'node server/train-model.mjs; semilla y particiones fijas; sin dependencias de ML.' },
    evaluation: Object.fromEntries(Object.entries(artifact.models).map(([key, model]) => [key, { ...model.evaluation, interval: model.interval, unit: key === 'etaMinutes' ? 'minutes' : 'percentage-points' }])),
    limitations: ['Las métricas solo describen el conjunto sintético y no validan precisión para Nuevo León.',
      'Los escenarios son ilustrativos; no se publican como incidentes ni estado del servicio real.',
      'Ocupación, clima y condición de unidades no están conectados a un operador.',
      'Accesibilidad de estaciones y unidades sin verificación: desconocida. La preferencia accesible no garantiza un trayecto accesible.',
      'Para producción se requieren convenios de datos, telemetría, aforos, auditoría de accesibilidad y validación temporal con viajes reales.'],
  };
}
