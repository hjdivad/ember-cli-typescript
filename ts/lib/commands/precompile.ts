import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { command } from '../utilities/ember-cli-entities';
import copyDeclarations from '../utilities/copy-declarations';

export const PRECOMPILE_MANIFEST = 'dist/.ts-precompile-manifest';

export default command({
  name: 'ts:precompile',
  works: 'insideProject',
  description:
    'Generates declaration files from TypeScript sources in preparation for publishing.',

  availableOptions: [{ name: 'manifest-path', type: String, default: PRECOMPILE_MANIFEST }],

  async run(options: { manifestPath: string }) {
    let outDir = `${process.cwd()}/e-c-ts-precompile-${process.pid}`;
    let { paths, rootDir, pathRoots } = this._loadConfig(outDir);
    if (!paths) {
      this.ui.writeLine(
        'No `paths` were found in your `tsconfig.json`, so `ts:precompile` is a no-op.'
      );
      return;
    }

    try {
      // prettier-ignore
      await execa('tsc', [
        '--allowJs', 'false',
        '--noEmit', 'false',
        '--rootDir', rootDir || this.project.root,
        '--isolatedModules', 'false',
        '--declaration',
        '--declarationDir', outDir,
        '--emitDeclarationOnly',
        '--pretty', 'true',
      ], {
        preferLocal: true,

        // Capture a string with stdout and stderr interleaved for error reporting
        all: true,
      });
    } catch (e) {
      fs.removeSync(outDir);
      console.error(`\n${e.all}\n`);
      throw e;
    }

    let manifestPath = options.manifestPath;
    let packageName = this.project.pkg.name;

    // Ensure that if we are dealing with an addon that is using a different
    // addon name from its package name, we use the addon name, since that is
    // how it will be written for imports.
    let addon = this.project.addons.find(addon => addon.root === this.project.root);
    if (addon && addon.name !== packageName) {
      packageName = addon.name;
    }

    let createdFiles = copyDeclarations(pathRoots, paths, packageName, this.project.root);

    fs.mkdirsSync(path.dirname(manifestPath));
    fs.writeFileSync(manifestPath, JSON.stringify(createdFiles.reverse()));
    fs.removeSync(outDir);
  },

  _loadConfig(outDir: string) {
    let ts = this.project.require('typescript') as typeof import('typescript');
    let configPath = ts.findConfigFile(this.project.root, ts.sys.fileExists);
    if (!configPath) {
      throw new Error('Unable to locate `tsconfig.json`');
    }

    let configSource = ts.readJsonConfigFile(configPath, ts.sys.readFile);
    let config = ts.parseJsonSourceFileConfigFileContent(
      configSource,
      ts.sys,
      path.dirname(configPath)
    );

    let { paths, rootDir, baseUrl } = config.options;
    let configDir = path.dirname(configPath);
    let relativeBaseDir = path.relative(configDir, baseUrl || configDir);

    let pathRoots = [
      // Any declarations found in the actual source
      path.resolve(rootDir || configDir, relativeBaseDir),

      // Any declarations generated by `tsc`
      path.resolve(outDir, relativeBaseDir),
    ];

    return { rootDir, paths, pathRoots };
  },
});
