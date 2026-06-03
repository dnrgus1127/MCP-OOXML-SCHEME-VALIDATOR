// @ooxml-tools/lsp-server 의 dist/bin.js 를 createRequire 배너와 함께 다시 번들한다.
//
// submodule(packages/ooxml-lsp) 의 lsp-server build 스크립트는 esbuild --format=esm 으로
// bin.js 를 번들하는데, adm-zip 같은 CommonJS 의존성이 런타임에 require('fs') 를 호출하면
// ESM 출력에서는 동적 require 가 막혀 "Dynamic require of \"fs\" is not supported" 로 로드에 실패한다.
// banner 로 createRequire 기반 require 를 주입해 이를 해결한다.
//
// submodule 은 pinned SHA 로 체크아웃되어 위 수정을 담을 수 없으므로,
// 이 스크립트를 메인 저장소에 두고 submodule build 직후 실행해 bin.js 를 덮어쓴다.
// 근본적으로는 ooxml-lsp 저장소의 lsp-server build 스크립트에 banner 가 반영되어야 한다.

import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lspDir = resolve(repoRoot, 'packages/ooxml-lsp/packages/lsp-server')

// esbuild 는 lsp-server 의 devDependency 이므로 그 위치 기준으로 resolve 한다.
const requireFromLsp = createRequire(resolve(lspDir, 'package.json'))
const esbuild = requireFromLsp('esbuild')

await esbuild.build({
  entryPoints: [resolve(lspDir, 'src/bin.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: [
    'vscode-languageserver',
    'vscode-languageserver/*',
    'vscode-languageserver-textdocument',
  ],
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
  outfile: resolve(lspDir, 'dist/bin.js'),
})

console.log('[build-lsp-bin] dist/bin.js 를 createRequire 배너와 함께 다시 번들했습니다.')
