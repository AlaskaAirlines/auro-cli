import { hmrPlugin, presets } from "@open-wc/dev-server-hmr";

export default {
  plugins: [
    hmrPlugin({
      include: ["src/**/*", "demo/**/*", "apiExamples/**/*", "docs/**/*"],
      // both v3 & v2
      presets: [presets.lit, presets.litElement],
    }),
  ],
};
