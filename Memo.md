

# Release Memo

1) package.jsom src-tauri/Cargo.toml src-tauri/tauri.conf.json の Version を最新にする
2) npm run build 

3) npm run build:portable
4) cd dist-portable
5) cp portable.html index.html
6) zip -r ../web-build_0.7.1_gh.zip . 
7) dist-portabe/ を docs/demo/ 配下にコピー

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
% ~/bin/butler push target/release/bundle/dmg/tetorica-mdrop_0.6.3_aarch64.dmg kyorohiro/tetorica-mdrop:mac-apple-silicon --userversion 0.6.3

% ~/bin/butler push target/x86_64-apple-darwin/release/bundle/dmg/tetorica-mdrop_0.6.3_x64.dmg kyorohiro/tetorica-mdrop:mac-intel --userversion 0.6.3
```

Github Action で Windows 版もできたら、

```
% ~/bin/butler push "tetorica-mdrop_0.6.3_x64-setup.exe" kyorohiro/tetorica-mdrop:windows --userversion 0.6.3
f
```

```
npm run build:portable
cd dist-portable
cp portable.html index.html
zip -r ../web-build_0.6.3_gh.zip .
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
