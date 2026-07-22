const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ignore temporary directories created by Expo native packages during install
// (e.g. expo-sharing_tmp_NNN/local-maven-repo) that Metro tries to watch
// but which no longer exist, causing ENOENT crashes.
config.resolver = config.resolver ?? {};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /node_modules[/\\].*_tmp_[0-9]+[/\\]/,
];

// Monorepo: watch the workspace root so Metro can resolve shared packages
config.watchFolders = [
  path.resolve(__dirname, '../../'),
];

module.exports = config;
