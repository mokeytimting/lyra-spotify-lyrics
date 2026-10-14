#!/usr/bin/env bash
# Lyra 啟動器（macOS / Linux）：安裝套件、啟動本機伺服器，再用 Chrome 應用程式視窗打開
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "找不到 Node.js，請先到 https://nodejs.org 安裝。"; exit 1; }
[ -d node_modules ] || npm install || exit 1

npm run dev &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 1 60); do curl -fs http://127.0.0.1:5180/ >/dev/null && break; sleep 0.5; done

URL=http://127.0.0.1:5180
if [ "$(uname)" = "Darwin" ]; then
  open -na "Google Chrome" --args --app="$URL" 2>/dev/null || open "$URL"
else
  (google-chrome --app="$URL" || chromium --app="$URL" || xdg-open "$URL") >/dev/null 2>&1 &
fi
echo "Lyra 正在執行，關閉這個視窗即可停止。"
wait $SERVER
