export default {
  compilerOptions: {
    allowJs: true,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    esModuleInterop: true,
    skipLibCheck: true,
    moduleResolution: "bundler",
    target: "ES2020",
    module: "ES2020",
    baseUrl: ".",
    paths: {
      "*": ["node_modules/*"],
    },
  },
};
