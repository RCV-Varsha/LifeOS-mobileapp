import { Platform } from 'react-native';

// Override this value for a hosted API. USB development uses adb reverse on port 3000.
const configuredApiUrl: string = '';
const developmentApiUrl = Platform.OS==='web' && !__DEV__ && typeof window!=='undefined'
  ? window.location.origin
  : 'http://127.0.0.1:3000';

export const API_URL = (configuredApiUrl || developmentApiUrl).replace(/\/+$/, '');

