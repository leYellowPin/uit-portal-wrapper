const fs = require('fs');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    prune: true,
    icon: path.join(__dirname, 'build/icon'),
    ignore: [
      /^\/\.git/,
      /^\/\.vscode/,
      /^\/build/,
      /^\/out/,
      /^\/README\.md$/,
      /^\/LICENSE$/,
      /^\/\.gitattributes$/,
      /^\/\.gitignore$/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'uit_portal_wrapper',
        setupIcon: path.join(__dirname, 'build/icon.ico')
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    },
    {
      name: '@electron-forge/maker-deb',
      config: {}
    }
  ],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      const keepLocales = new Set(['en-US.pak', 'vi.pak']);

      for (const outputPath of options.outputPaths) {
        const localesDir = path.join(outputPath, 'locales');
        if (!fs.existsSync(localesDir)) continue;

        for (const file of fs.readdirSync(localesDir)) {
          if (!keepLocales.has(file)) {
            fs.unlinkSync(path.join(localesDir, file));
          }
        }
      }
    }
  }
};