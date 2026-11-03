import { Platform } from 'react-native';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const developmentApiUrl = Platform.OS==='web' && !__DEV__ && typeof window!=='undefined'
  ? window.location.origin
  : 'http://127.0.0.1:3000';

export const API_URL = (configuredApiUrl || developmentApiUrl).replace(/\/+$/, '');
