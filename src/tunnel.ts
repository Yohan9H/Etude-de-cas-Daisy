// Le tunnel : il possède l'état du parcours de réservation et toutes ses
// transitions.
//
// Il ne touche jamais au DOM et n'importe aucune de ses dépendances : l'API,
// l'hôte et l'horloge lui sont donnés à la création. C'est ce qui permet de
// le tester sans navigateur, sans serveur et sans dépendre de la date du jour.

import type { Course, Resultat, Slot, Studio } from './api'

// --- Les dépendances ---------------------------------------------------------

export type ApiTunnel = {
  getCourses(): Promise<Resultat<{ courses: Course[] }>>
  getSlots(idCours: string, depuis: Date, jusqua: Date): Promise<Resultat<{ slots: Slot[] }>>
}

// La page qui nous héberge. Elle seule sait ouvrir et fermer le tunnel ; on
// ne peut que le lui demander.
export type Hote = {
  demanderOuverture(): void
  demanderFermeture(): void
}

export type Horloge = () => Date

// --- L'état ------------------------------------------------------------------

export type Ecran = { nom: 'bouton' } | { nom: 'cours' } | { nom: 'creneaux'; cours: Course }

// Un chargement a son propre état, à côté de l'écran : la liste des cours et
// celle des créneaux ne partagent pas le leur. Sinon le « Chargement… » des
// créneaux s'affiche sur la liste des cours quand on y revient.
export type Chargement<T> =
  | { etat: 'en-chargement' }
  | { etat: 'prete'; liste: T[] }
  | { etat: 'en-erreur'; message: string }

export type EtatTunnel = {
  ecran: Ecran

  // null tant que le tunnel n'a jamais été ouvert.
  cours: Chargement<Course> | null

  // Les créneaux du dernier cours choisi. null tant qu'aucun cours ne l'a été.
  creneaux: Chargement<Slot> | null
}

// La spec plafonne la fenêtre à 90 jours, au-delà c'est un 400.
// On demande le maximum : certains ateliers ne proposent qu'une date par mois,
// et une fenêtre plus courte renverrait parfois une liste vide à tort.
export const FENETRE_JOURS = 90

const UN_JOUR_MS = 24 * 60 * 60 * 1000

// --- Le tunnel ---------------------------------------------------------------

export function creerTunnel(dependances: {
  atelier: Studio
  api: ApiTunnel
  hote: Hote
  horloge: Horloge
}) {
  const { api, hote, horloge } = dependances

  let etat: EtatTunnel = { ecran: { nom: 'bouton' }, cours: null, creneaux: null }
  const abonnes = new Set<() => void>()

  // Numéro de la dernière demande de créneaux. Une réponse qui ne porte pas
  // ce numéro est périmée : la personne a choisi un autre cours entre-temps,
  // et ses créneaux ne doivent pas écraser ceux qu'elle regarde.
  let derniereDemandeCreneaux = 0

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

  // Même contrat que `chargerCours` : la liste est déjà en chargement.
  async function chargerCreneaux(cours: Course): Promise<void> {
    const depuis = horloge()
    const jusqua = new Date(depuis.getTime() + FENETRE_JOURS * UN_JOUR_MS)

    const demande = ++derniereDemandeCreneaux
    const resultat = await api.getSlots(cours.course_id, depuis, jusqua)

    if (demande !== derniereDemandeCreneaux) return

    if (!resultat.ok) {
      const message = texteDErreur(resultat.erreur.statut, resultat.erreur.code)
      changer({ creneaux: { etat: 'en-erreur', message } })
      return
    }

    changer({ creneaux: { etat: 'prete', liste: creneauxAVenir(resultat.donnees.slots) } })
  }

  // L'API peut renvoyer des créneaux déjà passés : on ne les propose pas.
  function creneauxAVenir(creneaux: Slot[]): Slot[] {
    const maintenant = horloge().getTime()

    return creneaux
      .filter((creneau) => new Date(creneau.starts_at).getTime() > maintenant)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
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

    choisirCours(cours: Course): void {
      changer({ ecran: { nom: 'creneaux', cours }, creneaux: { etat: 'en-chargement' } })
      chargerCreneaux(cours)
    },

    revenir(): void {
      if (etat.ecran.nom !== 'creneaux') return

      changer({ ecran: { nom: 'cours' } })
    },

    hoteAFerme(): void {
      changer({ ecran: { nom: 'bouton' } })
    },

    // On réessaie la liste affichée, pas une autre restée en erreur derrière.
    reessayer(): void {
      if (etat.ecran.nom === 'creneaux') {
        if (etat.creneaux?.etat !== 'en-erreur') return

        changer({ creneaux: { etat: 'en-chargement' } })
        chargerCreneaux(etat.ecran.cours)
        return
      }

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
function texteDErreur(statut: number | null, code: string): string {
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
