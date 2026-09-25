// Quick 260924-ftc (Expo SDK 55 alignment): packages/api-client lazy-loads
// mobile-only native modules with `import(/* webpackIgnore: true */ "expo-…")`
// so the Next.js webpack build skips them. Expo's Metro also honours that
// comment and leaves the `import()` untransformed, which Hermes cannot compile.
// This mobile-only plugin drops the comment before Metro collects dependencies,
// so the web build keeps its behaviour and the shared package stays unchanged.
const stripWebpackIgnore = () => ({
  name: "parisar-strip-webpack-ignore",
  visitor: {
    CallExpression(path) {
      if (path.node.callee.type !== "Import") return;
      const [firstArg] = path.node.arguments;
      if (!firstArg?.leadingComments) return;
      firstArg.leadingComments = firstArg.leadingComments.filter(
        (comment) => !comment.value.includes("webpackIgnore"),
      );
    },
  },
});

module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [stripWebpackIgnore],
  };
};
