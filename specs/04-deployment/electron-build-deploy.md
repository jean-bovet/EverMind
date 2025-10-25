# Build and Deployment Guide

> **Type:** Deployment Guide
> **Last Updated:** October 2025

Guide for building, packaging, and distributing the Electron application.

## Prerequisites

### Development Environment

**Required:**
- Node.js v18+ (v20 recommended)
- npm v9+
- macOS 11.0+ (for macOS builds)
- Xcode Command Line Tools: `xcode-select --install`

**For Distribution:**
- Apple Developer Account
- Developer ID Certificate (for code signing)
- Notarization credentials

### Installation

```bash
cd evernote-ai-importer
npm install
```

Installs: Electron, electron-builder, React, Vite, TypeScript, and all app dependencies.

## Development

### Run Development Mode

```bash
npm run electron:dev
```

**What Happens:**
1. Vite dev server starts (`http://localhost:5173`)
2. TypeScript compiles main/preload to `dist-electron/`
3. Electron launches with dev tools
4. Hot Module Replacement (HMR) enabled

**Features:**
- Instant React component updates
- DevTools open by default
- Source maps enabled
- Fast iteration cycle

**Stop:** `Ctrl+C` or `pkill -f electron`

## Production Build

### Build Application

```bash
npm run electron:build
```

**Build Steps:**
1. Clean previous builds
2. Compile TypeScript (`tsc`) → `dist/`
3. Build renderer (`vite build`) → `dist-renderer/`
4. Build main process → `dist-electron/`
5. Package with electron-builder → `release/`

**Output:**
```
release/
├── evernote-ai-importer-1.0.0.dmg       # Installer
├── evernote-ai-importer-1.0.0-arm64.dmg # Apple Silicon
└── mac/evernote-ai-importer.app         # Unpacked app
```

### Build for Specific Platform

```bash
# macOS only
npm run electron:build -- --mac

# Apple Silicon
npm run electron:build -- --mac --arm64

# Intel
npm run electron:build -- --mac --x64

# Both architectures
npm run electron:build -- --mac --universal
```

## Configuration

### electron-builder.json

**Key Settings:**
```json
{
  "appId": "com.yourcompany.evernote-ai-importer",
  "productName": "Evernote AI Importer",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg", "zip"],
    "icon": "build/icon.icns"
  }
}
```

**File:** `electron-builder.json` in project root

### Package.json Scripts

```json
{
  "electron:dev": "vite & electron .",
  "electron:build": "vite build && electron-builder",
  "electron:rebuild": "electron-rebuild"
}
```

## Code Signing (macOS)

### Developer ID Certificate

**Obtain Certificate:**
1. Enroll in Apple Developer Program ($99/year)
2. Create Developer ID Application certificate
3. Download and install in Keychain
4. Verify: `security find-identity -v -p codesigning`

**Configure electron-builder:**
```json
{
  "mac": {
    "identity": "Developer ID Application: Your Name (XXXXXXXXXX)",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  }
}
```

**Entitlements File (`build/entitlements.mac.plist`):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
```

### Notarization

**Required for:** Distribution outside Mac App Store (macOS 10.15+)

**Configure:**
```json
{
  "afterSign": "scripts/notarize.js",
  "mac": {
    "notarize": {
      "teamId": "XXXXXXXXXX"
    }
  }
}
```

**Notarization Script (`scripts/notarize.js`):**
```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.yourcompany.evernote-ai-importer',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};
```

**Environment Variables:**
```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

**App-Specific Password:** Generate at appleid.apple.com

## Native Dependencies

### Rebuild for Electron

Some native modules (like `better-sqlite3`) need rebuilding for Electron:

```bash
npm run electron:rebuild
```

**Or during installation:**
```bash
npm install --build-from-source
```

**Auto-rebuild:** electron-builder handles this automatically during packaging

## Testing Build

### Test DMG Installer

```bash
# Open DMG
open release/evernote-ai-importer-1.0.0.dmg

# Or install to /Applications
cp -R release/mac/evernote-ai-importer.app /Applications/
```

### Verify Code Signing

```bash
# Check signature
codesign --verify --deep --strict release/mac/evernote-ai-importer.app

# Display certificate
codesign -dv --verbose=4 release/mac/evernote-ai-importer.app

# Check notarization
spctl -a -vv release/mac/evernote-ai-importer.app
```

## Distribution

### DMG Distribution

**Advantages:**
- Single file
- macOS standard
- Can customize background/layout

**Upload to:**
- Website
- GitHub Releases
- Cloud storage

**Example GitHub Release:**
```bash
# Create release with gh CLI
gh release create v1.0.0 \
  release/evernote-ai-importer-1.0.0.dmg \
  --title "Version 1.0.0" \
  --notes "Initial release"
```

### Auto-Updates (Future)

**electron-updater** integration:
1. Host update files (YAML + DMG)
2. Configure update server URL
3. App checks for updates on launch
4. Download and install automatically

**Not currently implemented** (manual downloads only)

## CI/CD

### GitHub Actions Example

```yaml
name: Build

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run electron:build
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: release/*.dmg
```

**Secrets Required:** APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID

## Troubleshooting

### Build Errors

**"Module not found":**
- Run `npm install`
- Clear `node_modules` and reinstall

**"Native module" errors:**
- Run `npm run electron:rebuild`
- Check Node.js version matches Electron's

**TypeScript errors:**
- Run `npx tsc --noEmit` to check
- Fix type errors before building

### Code Signing Issues

**"No identity found":**
- Install Developer ID certificate
- Verify in Keychain Access

**"Notarization failed":**
- Check Apple ID credentials
- Verify app-specific password
- Check TeamID matches certificate

**"App is damaged" warning:**
- App not notarized
- Notarize or disable Gatekeeper for testing: `xattr -cr app.app`

### Performance Issues

**Slow builds:**
- Use `--no-universal` (build single arch)
- Disable source maps in production
- Use incremental builds

**Large app size:**
- Review dependencies (use `npm ls --depth=0`)
- Exclude dev dependencies
- Use asar compression (electron-builder default)

## Build Artifacts

**Locations:**
- `dist/` - Compiled CLI TypeScript
- `dist-electron/` - Compiled Electron code
- `dist-renderer/` - Built React app
- `release/` - Final packaged apps
- `.vite/` - Vite cache (can delete)

**Clean Build:**
```bash
rm -rf dist dist-electron dist-renderer release .vite
npm run electron:build
```

## File Sizes

**Typical Build:**
- DMG installer: ~150-200 MB
- Unpacked app: ~250-300 MB
- Includes: Electron runtime, Chromium, Node.js, app code

**Size Breakdown:**
- Electron framework: ~120 MB
- Node modules: ~50-80 MB
- App code: ~10-20 MB
- Resources (icons, etc.): <1 MB

## Source Code

**Build Configuration:**
- `electron-builder.json` - Packaging config
- `vite.config.ts` - Vite build config
- `tsconfig.json` - TypeScript config
- `package.json` - Scripts and metadata

**Build Scripts:** `scripts/` directory (if any)
