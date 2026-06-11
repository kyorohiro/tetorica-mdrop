# Release Memo

## Release Flow

1. Update version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`

2. Build web app:
   ```sh
   npm run build
   ```

3. Build portable web package:
   ```sh
   npm run build:portable
   cd dist-portable
   cp portable.html index.html
   zip -r ../web-build_0.7.1_gh.zip .
   cd ..
   ```

4. Copy `dist-portable/` to `docs/demo/` for GitHub Pages.

5. Push tag for Windows/Linux build:
   ```sh
   git tag v0.7.1
   git push origin v0.7.1
   ```

6. Build macOS app bundles:
   ```sh
   sh deploy_mac.sh
   ```

7. Build macOS CLI archives:
   ```sh
   sh deploy_mac_cli.sh
   ```

8. Upload to itch.io:
   ```sh
   ~/bin/butler login
   ~/bin/butler push target/aarch64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_aarch64.dmg kyorohiro/tetorica-mdrop:mac-apple-silicon --userversion 0.7.1
   ~/bin/butler push target/x86_64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_x64.dmg kyorohiro/tetorica-mdrop:mac-intel --userversion 0.7.1
   ~/bin/butler push "tetorica-mdrop_0.7.1_x64-setup.exe" kyorohiro/tetorica-mdrop:windows --userversion 0.7.1
   ~/bin/butler push "tetorica-mdrop_0.7.1_amd64.AppImage" kyorohiro/tetorica-mdrop:linux-appimage-amd64 --userversion 0.7.1
   ~/bin/butler push "tetorica-mdrop_0.7.1_aarch64.AppImage" kyorohiro/tetorica-mdrop:linux-appimage-aarch64 --userversion 0.7.1
   ```

9. Upload to GitHub Release manually:
   - `tetorica-mdrop-aarch64-apple-darwin.tar.gz`
   - `tetorica-mdrop-x86_64-apple-darwin.tar.gz`
   - `web-build_0.7.1_gh.zip`

10. After all uploads are complete, run the required update command in `kyorohiro/homebrew_tetorica`.

## Portable

### Dev

```sh
npm run dev:portable
```

Open:

```txt
http://localhost:5173/portable.html
```

### Build

```sh
npm run build:portable
cd dist-portable
cp portable.html index.html
zip -r ../web-build_0.7.1_gh.zip .
cd ..
```

## Windows and Linux

Builds are triggered by tag push:

```sh
git tag v0.7.1
git push origin v0.7.1
```

## macOS App

```sh
sh deploy_mac.sh
```

This builds:

- `target/aarch64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_aarch64.dmg`
- `target/x86_64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_x64.dmg`

## macOS CLI

```sh
sh deploy_mac_cli.sh
```

This creates:

- `tetorica-mdrop-aarch64-apple-darwin.tar.gz`
- `tetorica-mdrop-x86_64-apple-darwin.tar.gz`

## GitHub Pages

Copy portable build output to:

- `docs/demo/`

## Brew

After all release artifacts are uploaded, update `kyorohiro/homebrew_tetorica`.
