// Le pont entre le widget (dans l'iframe) et le loader (dans la page de l'artisan).
//
// C'est le seul passage entre les deux mondes. Il ne transporte que de la
// présentation et du cycle de vie — jamais une donnée client, jamais un
// contenu de formulaire, jamais un identifiant de réservation.
//
// Ce n'est pas une promesse, c'est structurel : le formulaire n'existe que dans
// l'iframe, et la réservation part de l'iframe directement vers l'API. Il n'y a
// aucun chemin par lequel une coordonnée pourrait remonter jusqu'au loader.

// --- Le protocole ------------------------------------------------------------

// Widget -> loader
export type MessageSortant =
  | 'ready' // je suis chargé, tout va bien
  | 'expand' // ouvre-moi en plein écran
  | 'collapse' // referme-moi

// Loader -> widget
export type MessageEntrant =
  | 'closed' // je t'ai refermé (Échap, clic sur le fond)

const MOI = 'daisy-widget'
const LUI = 'daisy-loader'

// Les paramètres que le loader nous a passés dans l'URL de l'iframe.
// L'URL ne change jamais, donc on les lit une seule fois.
const params = new URLSearchParams(window.location.search)

// --- Lecture de la configuration --------------------------------------------

export function clePublique(): string | null {
  return params.get('studio')
}

// L'origine du site qui nous a intégrés.
// On en a besoin comme DESTINATION de postMessage : on n'envoie jamais vers '*'.
export function origineHote(): string | null {
  const brut = params.get('host')

  if (!brut) return null

  // Ce paramètre vient de l'URL, donc n'importe qui peut l'écrire.
  // On le normalise en origine (schéma + domaine + port) et on refuse
  // tout ce qui n'est pas une URL valide : postMessage exige ce format exact.
  try {
    return new URL(brut).origin
  } catch {
    return null
  }
}

export function estDansUneIframe(): boolean {
  return window.parent !== window
}

// --- Envoi -------------------------------------------------------------------

export function envoyer(type: MessageSortant): void {
  // Widget ouvert directement dans un onglet : il n'y a personne à qui parler.
  if (!estDansUneIframe()) return

  const origine = origineHote()

  // Sans origine connue, on se tait. postMessage avec une destination
  // invalide lève une exception et empêcherait le widget de démarrer.
  if (!origine) return

  window.parent.postMessage({ source: MOI, type }, origine)
}

// --- Réception ---------------------------------------------------------------

export function ecouter(reaction: (type: MessageEntrant) => void): void {
  window.addEventListener('message', (event) => {
    // N'importe quelle page peut nous envoyer un message.
    // Ces deux vérifications sont la seule chose qui nous protège.
    if (event.origin !== origineHote()) return

    const message = event.data as { source?: string; type?: string } | null

    if (!message || message.source !== LUI) return

    if (message.type === 'closed') {
      reaction('closed')
    }
  })
}
