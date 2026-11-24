# ネコと和解せよ（ブラウザミニゲーム）

- 起動：index.html をダブルクリック（file:// で動く）。公開先は GitHub Pages（未公開）
- ビルド：npm run build（src/ → game.js と tools/bgm-preview/preview.bundle.js と tools/ogp/ogp.bundle.js。src を変えたら必ず実行）
- テスト：npm test（node --test。追加ライブラリなし）
- 設計：docs/architecture.md（処理フロー）、docs/spec.md（仕様・数値の根拠）
- 数値は src/data/params.js、文章は src/data/texts.js に集める
- 音は WebAudio で合成（音声ファイルなし）。端末内の保存は localStorage、キーは neko-wakai: で始める
- game.js と preview.bundle.js と ogp.bundle.js は生成物なので直接編集しない
