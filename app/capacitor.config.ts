import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.linguafox.app",
  appName: "Linguafox",
  webDir: "dist",
  android: {
    // Ship release builds over https so Supabase auth cookies and the
    // confirmation deep link behave the same as on the web.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
