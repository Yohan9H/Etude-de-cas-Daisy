// Petit serveur de fichiers statiques pour le dossier demo/.
//
// Il n'est là que pour une raison, et elle est importante :
// les pages de démonstration doivent être sur un AUTRE domaine que le widget.
// Ici c'est localhost:4000 contre localhost:5173 — un port différent suffit à
// faire deux origines différentes aux yeux du navigateur.
//
// Sans ça, l'isolation de l'iframe ne serait pas réellement mise à l'épreuve.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = 4000
const RACINE = new URL('../demo/', import.meta.url).pathname

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  let chemin = decodeURIComponent(url.pathname)

  if (chemin === '/') chemin = '/index.html'

  // On empêche de sortir du dossier demo/ avec des ../
  const relatif = normalize(chemin).replace(/^(\.\.[/\\])+/, '')
  const fichier = join(RACINE, relatif)

  try {
    const contenu = await readFile(fichier)

    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' })
    res.end(contenu)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404')
  }
})

serveur.listen(PORT, () => {
  console.log(`[demo] site hostile  http://localhost:${PORT}/hostile.html`)
  console.log(`[demo] site sobre    http://localhost:${PORT}/normal.html`)
})
