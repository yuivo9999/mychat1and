import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yuivo9999.mychat',
  appName: 'MyChat',
  webDir: 'dist',
  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    // On Android, route fetch/XHR through Capacitor's native HTTP stack.
    // This removes browser CORS restrictions for model providers and web APIs.
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
