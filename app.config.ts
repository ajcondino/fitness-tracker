import type { ConfigContext, ExpoConfig } from 'expo/config';

// Wraps app.json so the Google Maps key can come from the environment
// (.env.local locally, the `preview` EAS Environment in CI) instead of source control.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }],
  ],
});
