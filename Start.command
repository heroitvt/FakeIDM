#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf 'Bản mã nguồn cần Node.js 22 trở lên. Trên Mac, hãy mở FakeIDM.app đi kèm để dùng ngay.\n'
  read -r -p 'Bấm Enter để đóng…'
  exit 1
fi
node server.mjs --open
