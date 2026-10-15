import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.regiomovil.app',
  appName: 'RegioMóvil',
  webDir: 'dist',
  backgroundColor: '#F5F7F2',
  android: {
    backgroundColor: '#F5F7F2',
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
  // The installed application always opens its own local bundle. Set the
  // HTTPS backend with VITE_API_BASE_URL when compiling the web application.
  // Do not set server.url here: that would make startup depend on a server.
};

export default config;
