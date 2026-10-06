import { defineConfig } from 'vite'

// Vite sert deux choses :
//   - index.html et src/  -> la page du widget, celle qui s'affiche dans l'iframe
//   - public/v1.js        -> le loader, servi tel quel à la racine
//
// En production ces deux choses seraient sur widget.daisy.example.

export default defineConfig({
  server: {
    port: 5173,

    // On veut échouer plutôt que glisser sur un autre port :
    // le loader et les pages de démo pointent vers 5173 en dur.
    strictPort: true,
  },
})
