// Expo runtime config doesn't exist on web; typed so the dev-host probing in
// config/serverUrl.ts compiles (it reads optional fields off these).
const Constants: {
  expoConfig: { hostUri?: string } | null;
  expoGoConfig: unknown;
  manifest2: unknown;
} = {
  expoConfig: null,
  expoGoConfig: null,
  manifest2: null,
};

export default Constants;

