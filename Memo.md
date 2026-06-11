

# Release Memo

```
1) package.jsom src-tauri/Cargo.toml src-tauri/tauri.conf.json の Version を最新にする
2) npm run build 

// portable 版 (web) を ビルド
3) npm run build:portable
4) cd dist-portable
5) cp portable.html index.html
6) zip -r ../web-build_0.7.1_gh.zip . 
7) dist-portabe/ を docs/demo/ 配下にコピー

// windows linux ビルド
8) git tag v0.7.1
9) git push origin v0.7.1 

// macビルド
10) sh deploy_mac.sh


// itchにリリース
% ~/bin/butler login
% ~/bin/butler push target/release/bundle/dmg/tetorica-mdrop_0.7.1_aarch64.dmg kyorohiro/tetorica-mdrop:mac-apple-silicon --userversion 0.7.1

% ~/bin/butler push target/x86_64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_x64.dmg kyorohiro/tetorica-mdrop:mac-intel --userversion 0.7.1

% ~/bin/butler push "tetorica-mdrop_0.7.1_x64-setup.exe" kyorohiro/tetorica-mdrop:windows --userversion 0.7.1

% ~/bin/butler push "tetorica-mdrop_0.7.1_aarch64.AppImage" kyorohiro/tetorica-mdrop:linux-amd64 --userversion 0.7.1

% ~/bin/butler push "tetorica-mdrop_0.7.1_amd64.AppImage" kyorohiro/tetorica-mdrop:linux-amd64 --userversion 0.7.1


sh deploy_mac_cli.sh

以下を手動でgithub release にあげる

- tetorica-mdrop-aarch64-apple-darwin.tar.gz
- tetorica-mdrop-x86_64-apple-darwin.tar.gz


全て上げ終わったら
kyorohiro/homebrew_tetorica で 所定のcommand を実行
```


# For Portable 


### dev

```
npm run dev:portable
-> http://localhost:5173/portable.html
```

### build

```
npm run build:portable
cd dist-portable
cp portable.html index.html
zip -r ../web-build_0.6.2_gh.zip .
```


# For Windows and Linux 

で、ビルド

```
git tag xxx
git push xxxx
```

# For Itch 

```
sh deploy_mac.sh
% ~/bin/butler push target/aarch64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_aarch64.dmg kyorohiro/tetorica-mdrop:mac-apple-silicon --userversion 0.7.1

% ~/bin/butler push target/x86_64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.7.1_x64.dmg kyorohiro/tetorica-mdrop:mac-intel --userversion 0.7.1
```

Github Action で Windows 版もできたら、

```
% ~/bin/butler push "tetorica-mdrop_0.7.1_x64-setup.exe" kyorohiro/tetorica-mdrop:windows --userversion 0.7.1
f
```

```
npm run build:portable
cd dist-portable
cp portable.html index.html
zip -r ../web-build_0.7.1_gh.zip .
```

# For github io

itch向けの dist-portable を docs/demo にコピー

# For Github

```
sh deploy_mac_cli.sh
```

以下を手動でgithub release にあげる

- tetorica-mdrop-aarch64-apple-darwin.tar.gz
- tetorica-mdrop-x86_64-apple-darwin.tar.gz

# For Brew 

全て上げ終わったら
kyorohiro/homebrew_tetorica で 所定のcommand を実行
