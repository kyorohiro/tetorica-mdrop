export APPLE_SIGNING_IDENTITY="Developer ID Application: KIYOHIRO KAWAMURA (5H7KW7PC7C)"
export APPLE_ID="kyorohiro@gmail.com"
export APPLE_PASSWORD="{password}"
export APPLE_TEAM_ID="5H7KW7PC7C"
mkdir -p dist-cli

cp target/aarch64-apple-darwin/release/tetorica-mdrop dist-cli/

codesign \
  --force \
  --timestamp \
  --options runtime \
  --sign "$APPLE_SIGNING_IDENTITY" \
  dist-cli/tetorica-mdrop

tar -czf tetorica-mdrop-aarch64-apple-darwin.tar.gz -C dist-cli tetorica-mdrop

shasum -a 256 tetorica-mdrop-aarch64-apple-darwin.tar.gz

#
# % sh deploy_mac_cli.sh
# dist-cli/tetorica-mdrop: replacing existing signature
# 6c97a7e27cbd061999b9c6330e8e17e307e747f7cc337ec7ed62f5deab5c6c6c  tetorica-mdrop-aarch64-apple-darwin.tar.gz
