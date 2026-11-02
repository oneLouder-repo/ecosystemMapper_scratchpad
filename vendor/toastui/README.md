# Toast UI Editor 3.2.2

The Markdown and WYSIWYG editor behind Dashi docs (library.html).

- Source: https://github.com/nhn/tui.editor (npm `@toast-ui/editor@3.2.2`)
- Licence: MIT (Toast UI Editor), MIT (ProseMirror), Apache-2.0 / MPL-2.0 (DOMPurify).
  The licence headers are kept at the end of `toastui-editor.js`.
- `toastui-editor.js` is the npm package's ESM build bundled with its
  dependencies (ProseMirror, DOMPurify) into one file, because the app's
  Content-Security-Policy only allows scripts from its own address:

      npm i @toast-ui/editor@3.2.2 esbuild
      echo "import Editor from '@toast-ui/editor'; window.toastui = { Editor };" > entry.js
      npx esbuild entry.js --bundle --minify --format=iife --legal-comments=eof --outfile=toastui-editor.js

- `toastui-editor.css` is `dist/toastui-editor.css` from the package, unchanged.
