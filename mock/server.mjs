// Faux serveur de l'API Daisy, décrit dans daisy-api.md.
//
// Deux raisons d'exister :
//   1. l'API réelle n'existe pas (api.daisy.example est un domaine d'exemple) ;
//   2. il faut pouvoir provoquer les cas dégradés à la demande, en démonstration.
//
// Il tourne sur un autre port que le widget : c'est donc un vrai appel
// cross-origin, avec du vrai CORS, comme entre widget.daisy.example et api.daisy.example.
//
// Page de contrôle des scénarios : http://localhost:3001/__mock

import { createServer } from 'node:http'

import { studio, courses, creneauxDuCours, creneauParId, reserverPlaces } from './data.mjs'

const PORT = 3001
const BASE = '/public/v1'

// Latence de POST /bookings : la spec dit 1,5 à 4 secondes, non négociable.
const LATENCE_POST_MIN = 1500
const LATENCE_POST_MAX = 4000

const SCENARIOS = {
  ok: 'Tout fonctionne normalement',

  slot_full: '409 slot_full — plus aucune place',
  slot_full_partial: '409 slot_full — il reste 1 place, moins que demandé',
  slot_cancelled: '409 slot_cancelled — l\'artisan a annulé le créneau',

  phone_required: '422 phone_required',
  too_many_seats: '422 too_many_seats',
  rate_limited: '429 rate_limited',

  no_phone: 'L\'atelier ne demande PAS de téléphone (le champ disparaît)',
  branding_pale: 'L\'artisan a choisi un rose très pâle (test du contraste)',

  origin_not_allowed: '403 origin_not_allowed — domaine non déclaré (1 install sur 3)',
  server_error: '500 sur tous les endpoints',

  slow: 'Lecture très lente (+3 s sur les GET)',
  hang: 'Le serveur ne répond jamais (test du délai d\'attente)',
}

let scenario = 'ok'

// --- Utilitaires ---------------------------------------------------------------

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function latenceDeCreation() {
  return LATENCE_POST_MIN + Math.random() * (LATENCE_POST_MAX - LATENCE_POST_MIN)
}

function repondreJson(res, code, corps) {
  const texte = JSON.stringify(corps, null, 2)

  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texte),
  })

  res.end(texte)
}

function erreur(res, code, nom, extra = {}) {
  repondreJson(res, code, { error: nom, ...extra })
}

// Le widget est sur un autre port, donc le navigateur exige ces en-têtes.
function appliquerCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  // X-Daisy-Studio porte la clé publique de l'atelier. Sans cette ligne, le
  // navigateur refuserait la requête avant même de l'envoyer.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Daisy-Studio')
  res.setHeader('Access-Control-Max-Age', '600')
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let brut = ''

    req.on('data', (morceau) => {
      brut += morceau

      // Garde-fou : on ne veut pas accumuler sans limite.
      if (brut.length > 100_000) reject(new Error('corps trop grand'))
    })

    req.on('end', () => {
      try {
        resolve(brut ? JSON.parse(brut) : {})
      } catch {
        reject(new Error('json invalide'))
      }
    })
  })
}

// --- Page de contrôle des scénarios --------------------------------------------

function pageDeControle() {
  const lignes = Object.entries(SCENARIOS)
    .map(([nom, texte]) => {
      const actif = nom === scenario

      return `<li>
        <a href="/__mock/set?scenario=${nom}" class="${actif ? 'actif' : ''}">
          <code>${nom}</code> — ${texte}
        </a>
      </li>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Faux serveur Daisy</title>
  <style>
    body   { font: 15px/1.6 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
    ul     { list-style: none; padding: 0; }
    li     { margin: .3rem 0; }
    a      { display: block; padding: .6rem .8rem; border: 1px solid #ddd; border-radius: 6px;
             text-decoration: none; color: inherit; }
    a:hover      { background: #f6f6f6; }
    a.actif      { border-color: #C4643A; background: #fdf3ef; font-weight: 600; }
    code         { background: #f0f0f0; padding: .1rem .3rem; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Faux serveur Daisy</h1>
  <p>Scénario actif : <code>${scenario}</code></p>
  <ul>
${lignes}
  </ul>
  <p><small>Le scénario s'applique au prochain appel. Les places réservées restent
  décomptées jusqu'au redémarrage du serveur.</small></p>
</body>
</html>`
}

// --- Endpoints -----------------------------------------------------------------

// Ce faux serveur n'a qu'un atelier, donc il ignore la clé reçue. Une vraie
// API s'en servirait pour savoir de quel atelier il s'agit : les endpoints de
// la spec ne prennent aucun identifiant dans leur URL.
async function getStudio(res) {
  // Le faux serveur n'a qu'un seul atelier, avec requires_phone à true.
  // Ce scénario permet d'exercer l'autre branche : un atelier qui ne demande
  // pas de téléphone, donc un champ de moins dans le formulaire.
  // Une couleur de marque très claire : avec un texte blanc figé, les boutons
  // deviendraient illisibles. Sert à montrer que le widget calcule lui-même la
  // couleur du texte.
  if (scenario === 'branding_pale') {
    return repondreJson(res, 200, {
      ...studio,
      branding: { ...studio.branding, primary_color: '#F8D7DA' },
    })
  }

  if (scenario === 'no_phone') {
    return repondreJson(res, 200, {
      ...studio,
      booking_policy: { ...studio.booking_policy, requires_phone: false },
    })
  }

  repondreJson(res, 200, studio)
}

async function getCourses(res) {
  repondreJson(res, 200, { courses })
}

async function getSlots(res, courseId, params) {
  const creneaux = creneauxDuCours(courseId)

  if (!creneaux) {
    return erreur(res, 404, 'course_not_found')
  }

  const depuis = params.get('from')
  const jusqua = params.get('to')

  // La spec impose une fenêtre de 90 jours maximum.
  if (depuis && jusqua) {
    const jours = (new Date(jusqua) - new Date(depuis)) / 86_400_000

    if (jours > 90) {
      return erreur(res, 400, 'window_too_large')
    }
  }

  // On applique vraiment la fenêtre demandée, sinon le paramètre ne voudrait rien dire.
  const debut = depuis ? new Date(`${depuis}T00:00:00`) : null
  const fin = jusqua ? new Date(`${jusqua}T23:59:59`) : null

  const dansLaFenetre = creneaux.filter((creneau) => {
    const quand = new Date(creneau.starts_at)

    if (debut && quand < debut) return false
    if (fin && quand > fin) return false

    return true
  })

  // Les créneaux complets sont renvoyés, pas filtrés : c'est au widget de décider quoi en faire.
  repondreJson(res, 200, { slots: dansLaFenetre })
}

async function postBooking(req, res) {
  let corps

  try {
    corps = await lireCorps(req)
  } catch {
    return erreur(res, 400, 'invalid_body')
  }

  // On attend AVANT de répondre, quel que soit le résultat :
  // c'est pendant cette attente que l'utilisateur va recliquer.
  await attendre(latenceDeCreation())

  if (scenario === 'slot_full') {
    return erreur(res, 409, 'slot_full', { available: 0 })
  }

  if (scenario === 'slot_full_partial') {
    return erreur(res, 409, 'slot_full', { available: 1 })
  }

  if (scenario === 'slot_cancelled') {
    return erreur(res, 409, 'slot_cancelled')
  }

  if (scenario === 'phone_required') {
    return erreur(res, 422, 'phone_required')
  }

  if (scenario === 'too_many_seats') {
    return erreur(res, 422, 'too_many_seats')
  }

  if (scenario === 'rate_limited') {
    return erreur(res, 429, 'rate_limited')
  }

  // Validations réelles, dans l'ordre de la spec.
  const places = Number(corps.seats ?? 1)

  if (places > studio.booking_policy.max_seats_per_booking) {
    return erreur(res, 422, 'too_many_seats')
  }

  if (studio.booking_policy.requires_phone && !corps.customer?.phone) {
    return erreur(res, 422, 'phone_required')
  }

  const resultat = reserverPlaces(corps.slot_id, places)

  if (!resultat.ok && resultat.raison === 'introuvable') {
    return erreur(res, 404, 'slot_not_found')
  }

  // Le 409 « naturel » : les places ont vraiment été prises entre-temps.
  if (!resultat.ok) {
    return erreur(res, 409, 'slot_full', { available: resultat.available })
  }

  repondreJson(res, 201, {
    booking_id: `bkg_${Math.floor(10_000 + Math.random() * 89_999)}`,
    status: 'confirmed',
    confirmation_code: codeDeConfirmation(),
    total_cents: resultat.total_cents,
  })
}

function codeDeConfirmation() {
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suite = ''

  for (let i = 0; i < 4; i++) {
    suite += lettres[Math.floor(Math.random() * lettres.length)]
  }

  return `TF-${suite}`
}

// --- Routage -------------------------------------------------------------------

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const chemin = url.pathname

  appliquerCors(req, res)

  // Requête préalable du navigateur avant un POST cross-origin.
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // Le logo de l'atelier. La spec pointe vers un cdn.daisy.example qui
  // n'existe pas ; on en sert un vrai pour que l'affichage soit vérifiable.
  if (chemin === '/logo.svg') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#C4643A"/>
      <path d="M20 44c0-9 5.4-16 12-16s12 7 12 16z" fill="#fff" opacity=".92"/>
      <ellipse cx="32" cy="26" rx="9" ry="4" fill="#fff"/>
    </svg>`

    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' })
    return res.end(svg)
  }

  // Page de contrôle et changement de scénario.
  if (chemin === '/__mock') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(pageDeControle())
  }

  if (chemin === '/__mock/set') {
    const demande = url.searchParams.get('scenario')

    if (demande && demande in SCENARIOS) {
      scenario = demande
      console.log(`[mock] scénario -> ${scenario}`)
    }

    res.writeHead(302, { Location: '/__mock' })
    return res.end()
  }

  // Scénarios qui s'appliquent à tous les endpoints de l'API.
  if (chemin.startsWith(BASE)) {
    // Un scénario oublié casse une démonstration sans qu'on comprenne pourquoi.
    // On le rappelle dans la console à chaque appel.
    if (scenario !== 'ok') {
      console.log(`[mock] ⚠  scénario « ${scenario} » actif sur ${chemin}`)
    }

    if (scenario === 'hang') {
      console.log('[mock] requête laissée sans réponse :', chemin)
      return
    }

    if (scenario === 'origin_not_allowed') {
      return erreur(res, 403, 'origin_not_allowed')
    }

    if (scenario === 'server_error') {
      return erreur(res, 500, 'internal_error')
    }
  }

  if (req.method === 'GET' && scenario === 'slow') {
    await attendre(3000)
  }

  // Endpoints.
  if (req.method === 'GET' && chemin === `${BASE}/studio`) {
    return getStudio(res)
  }

  if (req.method === 'GET' && chemin === `${BASE}/courses`) {
    return getCourses(res)
  }

  const creneaux = chemin.match(new RegExp(`^${BASE}/courses/([^/]+)/slots$`))

  if (req.method === 'GET' && creneaux) {
    return getSlots(res, creneaux[1], url.searchParams)
  }

  if (req.method === 'POST' && chemin === `${BASE}/bookings`) {
    return postBooking(req, res)
  }

  erreur(res, 404, 'not_found')
})

serveur.listen(PORT, () => {
  console.log(`[mock] API      http://localhost:${PORT}${BASE}`)
  console.log(`[mock] contrôle http://localhost:${PORT}/__mock`)
  console.log(`[mock] ${courses.length} cours en mémoire`)
})
