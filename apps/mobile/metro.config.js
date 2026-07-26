// Metro config for Expo monorepo
// See: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Resolve packages from project + monorepo root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Force Metro to resolve only from `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

// 4. Polyfill Node built-ins for react-native-svg's `buffer` import.
//    react-native-svg@15 imports 'buffer' in its fetchData utility.
config.resolver.extraNodeModules = {
  buffer: require.resolve("buffer"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
