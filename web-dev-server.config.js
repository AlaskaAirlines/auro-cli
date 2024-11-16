import { hmrPlugin, presets } from "@open-wc/dev-server-hmr";

export default {
  plugins: [
    hmrPlugin({
      include: ["src/**/*", "apiExamples/**/*"],
      // both v3 & v2
      presets: [presets.lit, presets.litElement],
    }),
  ],
};
