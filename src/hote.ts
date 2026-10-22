// Les deux façons d'héberger le tunnel. Le choix se fait une seule fois, au
// démarrage : le tunnel lui-même ne sait pas s'il est dans une iframe.

import { envoyer } from './pont'
import type { Hote } from './tunnel'

// Dans le site de l'artisan : on demande au loader, qui nous renverra
// 'closed' une fois l'iframe refermée.
export function hoteIframe(): Hote {
  return {
    demanderOuverture: () => envoyer('expand'),
    demanderFermeture: () => envoyer('collapse'),
  }
}

// Widget ouvert seul pendant le développement : personne ne nous renverra
// 'closed', on confirme donc la fermeture nous-mêmes, tout de suite.
export function hoteAutonome(confirmerFermeture: () => void): Hote {
  return {
    demanderOuverture: () => {},
    demanderFermeture: confirmerFermeture,
  }
}
