// NODE_ENV in .env configures the local API. It must never make a distributable
// include React's development runtime, including when built from Android/CI.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
