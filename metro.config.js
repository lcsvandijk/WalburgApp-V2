const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('ics')) {
  config.resolver.assetExts.push('ics');
}

module.exports = config;
