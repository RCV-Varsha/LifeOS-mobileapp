const { withProjectBuildGradle } = require('expo/config-plugins');

const marker = '// LifeOS: Windows C++ driver workaround';
const gradleBlock = `
${marker}
// CMake can shorten clang++.exe to CLANG_~1.EXE when the SDK path has spaces.
// With -no-canonical-prefixes, clang then omits the C++ runtime at link time.
// Explicit driver mode preserves C++ linking without replacing NDK defaults.
if (System.getProperty('os.name').startsWith('Windows')) {
  subprojects { nativeProject ->
    ['com.android.application', 'com.android.library'].each { pluginId ->
      nativeProject.plugins.withId(pluginId) {
        nativeProject.extensions.getByName('androidComponents').finalizeDsl { androidDsl ->
          def flags = androidDsl.defaultConfig.externalNativeBuild.cmake.cppFlags
          if (!flags.contains('--driver-mode=g++')) {
            flags.add('--driver-mode=g++')
          }
        }
      }
    }
  }
}
`;

function patchGradle(contents) {
  // ReactRootProjectPlugin eagerly evaluates :app through evaluationDependsOn.
  // Register callbacks before applying root plugins, not at the end of the file.
  let source = contents.replace(/\r\n/g, '\n');
  if (source.includes(marker)) {
    if (!source.includes(gradleBlock.trim())) {
      throw new Error('Unrecognized LifeOS C++ workaround block; inspect build.gradle before updating');
    }
    source = source.replace(gradleBlock.trim(), '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }
  const rootPlugin = /^apply plugin:\s*["'](?:expo-root-project|com\.facebook\.react\.rootproject)["']/m;
  const match = rootPlugin.exec(source);
  if (!match) throw new Error('Could not locate Android root plugins for the Windows C++ workaround');
  return source.slice(0, match.index).trimEnd() + '\n\n' + gradleBlock.trim() + '\n\n' + source.slice(match.index);
}

module.exports = function withWindowsCxxDriver(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('LifeOS Windows C++ workaround requires a Groovy root build.gradle');
    }
    mod.modResults.contents = patchGradle(mod.modResults.contents);
    return mod;
  });
};
module.exports.patchGradle = patchGradle;
