// Le tunnel : il possède l'état du parcours de réservation et toutes ses
// transitions.
//
// Il ne touche jamais au DOM et n'importe aucune de ses dépendances : l'API,
// l'hôte et l'horloge lui sont donnés à la création. C'est ce qui permet de
// le tester sans navigateur, sans serveur et sans dépendre de la date du jour.

import type { Course, Resultat, Studio } from './api'

// --- Les dépendances ---------------------------------------------------------

export type ApiTunnel = {
  getCourses(): Promise<Resultat<{ courses: Course[] }>>
}

// La page qui nous héberge. Elle seule sait ouvrir et fermer le tunnel ; on
// ne peut que le lui demander.
export type Hote = {
  demanderOuverture(): void
  demanderFermeture(): void
}

export type Horloge = () => Date

// --- L'état ------------------------------------------------------------------

export type Ecran = { nom: 'bouton' } | { nom: 'cours' }

// Un chargement a son propre état, à côté de l'écran : la liste des cours ne
// partage le sien avec aucune autre liste.
export type Chargement<T> =
  | { etat: 'en-chargement' }
  | { etat: 'prete'; liste: T[] }
  | { etat: 'en-erreur'; message: string }

export type EtatTunnel = {
  ecran: Ecran

  // null tant que le tunnel n'a jamais été ouvert.
  cours: Chargement<Course> | null
}

// --- Le tunnel ---------------------------------------------------------------

export function creerTunnel(dependances: {
  atelier: Studio
  api: ApiTunnel
  hote: Hote
  horloge: Horloge
}) {
  const { api, hote } = dependances

  let etat: EtatTunnel = { ecran: { nom: 'bouton' }, cours: null }
  const abonnes = new Set<() => void>()

  function changer(modification: Partial<EtatTunnel>): void {
    etat = { ...etat, ...modification }
    for (const abonne of abonnes) abonne()
  }

  // Celui qui appelle a déjà mis la liste en chargement, dans le même
  // changement que le reste de sa transition : un seul redessin.
  async function chargerCours(): Promise<void> {
    const resultat = await api.getCourses()

    if (!resultat.ok) {
      const message = texteDErreur(resultat.erreur.statut, resultat.erreur.code)
      changer({ cours: { etat: 'en-erreur', message } })
      return
    }

    changer({ cours: { etat: 'prete', liste: resultat.donnees.courses } })
  }

  return {
    get etat(): EtatTunnel {
      return etat
    },

    // Renvoie de quoi se désabonner.
    abonner(abonne: () => void): () => void {
      abonnes.add(abonne)
      return () => abonnes.delete(abonne)
    },

    ouvrir(): void {
      hote.demanderOuverture()

      // On ne charge les cours qu'à la première ouverture, pas à la création.
      // Le bouton est affiché à tous les visiteurs du site de l'artisan ; la
      // liste n'intéresse que ceux qui cliquent. Sur un trafic à 60 % mobile,
      // ça évite de télécharger 40 cours pour rien.
      if (etat.cours !== null) {
        changer({ ecran: { nom: 'cours' } })
        return
      }

      changer({ ecran: { nom: 'cours' }, cours: { etat: 'en-chargement' } })
      chargerCours()
    },

    // On ne fait que demander : c'est l'hôte qui ferme, et il nous le
    // confirme par `hoteAFerme`.
    fermer(): void {
      if (etat.ecran.nom === 'bouton') return

      hote.demanderFermeture()
    },

    hoteAFerme(): void {
      changer({ ecran: { nom: 'bouton' } })
    },

    reessayer(): void {
      if (etat.cours?.etat !== 'en-erreur') return

      changer({ cours: { etat: 'en-chargement' } })
      chargerCours()
    },
  }
}

export type Tunnel = ReturnType<typeof creerTunnel>

// --- Textes d'erreur ---------------------------------------------------------

// Un message par cause, jamais un code technique : « erreur 403 » ne veut rien
// dire pour quelqu'un qui veut réserver un cours de poterie.
//
// Exporté le temps que le chargement des créneaux rejoigne le tunnel.
export function texteDErreur(statut: number | null, code: string): string {
  if (statut === null) {
    return 'Vérifiez votre connexion internet, puis réessayez.'
  }

  if (code === 'origin_not_allowed') {
    return 'Ce site n’est pas encore autorisé à afficher les réservations de l’atelier.'
  }

  if (statut === 429) {
    return 'Trop de demandes en peu de temps. Patientez une minute, puis réessayez.'
  }

  if (statut >= 500) {
    return 'Le service est momentanément indisponible. Réessayez dans un instant.'
  }

  return 'Une erreur inattendue est survenue.'
}
