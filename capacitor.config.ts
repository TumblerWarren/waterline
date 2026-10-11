import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.waterline.household',
  appName: 'Waterline',
  webDir: 'dist/client',
  server: { androidScheme: 'https', cleartext: false },
  android: { backgroundColor: '#f5f7f3' },
  plugins: {
    SystemBars: { style: 'DARK', insetsHandling: 'native', initialViewportFitValueHint: 'contain' },
    StatusBar: { style: 'DARK' },
    Keyboard: { resizeOnFullScreen: true },
  },
};
export default config;
