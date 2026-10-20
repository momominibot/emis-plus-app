const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Handle WASM files for web (expo-sqlite uses wa-sqlite)
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'wasm'];

module.exports = config;
