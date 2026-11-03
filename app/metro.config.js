const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Build exports and temporary Java sockets are not JavaScript source. Watching
// socket files on Windows can terminate Metro with EACCES during native builds.
const dist = path.resolve(__dirname, 'dist').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const previous = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  new RegExp(`^${dist}(?:[/\\\\].*)?$`),
];
module.exports = config;
