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

export type Ecran =
  | { nom: 'bouton' }
  | { nom: 'cours' }
  | { nom: 'creneaux'; cours: Course }
  // `placesMaximum` est la borne des places pour ce créneau : l'écran n'a pas
  // à la recalculer.
  | { nom: 'coordonnees'; cours: Course; creneau: Slot; placesMaximum: number }

// Un chargement a son propre état, à côté de l'écran : la liste des cours et
// celle des créneaux ne partagent pas le leur. Sinon le « Chargement… » des
// créneaux s'affiche sur la liste des cours quand on y revient.
export type Chargement<T> =
  | { etat: 'en-chargement' }
  | { etat: 'prete'; liste: T[] }
  | { etat: 'en-erreur'; message: string }

// Les clés reprennent celles de l'API : la saisie part telle quelle dans
// `customer`, plus les précisions.
export type Saisie = {
  first_name: string
  last_name: string
  email: string
  phone: string
  notes: string
}

export type EtatTunnel = {
  ecran: Ecran

  // null tant que le tunnel n'a jamais été ouvert.
  cours: Chargement<Course> | null

  // Les créneaux du dernier cours choisi. null tant qu'aucun cours ne l'a été.
  creneaux: Chargement<Slot> | null

  // Toujours dans les limites de `bornerPlaces` pour le créneau choisi.
  places: number

  // Gardée hors des écrans : revenir aux créneaux ou subir un refus ne doit
  // pas obliger à retaper ce qu'on vient de saisir.
  saisie: Saisie

  // Un champ en moins à l'étape où on perd 60 % des gens : le téléphone
  // n'est demandé que si l'atelier l'exige.
  telephoneDemande: boolean
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
  const { atelier, api, hote, horloge } = dependances

  let etat: EtatTunnel = {
    ecran: { nom: 'bouton' },
    cours: null,
    creneaux: null,
    places: 1,
    saisie: { first_name: '', last_name: '', email: '', phone: '', notes: '' },
    telephoneDemande: atelier.booking_policy.requires_phone,
  }
  const abonnes = new Set<() => void>()

  // Numéro de la dernière demande de créneaux. Une réponse qui ne porte pas
  // ce numéro est périmée : la personne a choisi un autre cours entre-temps,
  // et ses créneaux ne doivent pas écraser ceux qu'elle regarde.
  let derniereDemandeCreneaux = 0

  // Le nombre de places vaut pour un cours : on le garde d'un créneau à
  // l'autre, mais on repart d'une place quand le cours change.
  let idDernierCours: string | null = null

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

  // Deux limites se cumulent : celle que l'atelier s'impose, et ce qui reste
  // réellement sur ce créneau. C'est la plus basse qui s'applique, jamais
  // moins d'une place. Seul endroit où cette borne est écrite.
  function placesMaximum(creneau: Slot): number {
    return Math.max(1, Math.min(atelier.booking_policy.max_seats_per_booking, creneau.seats_available))
  }

  // On ne fait pas confiance à la valeur demandée : un <select> dont la valeur
  // ne correspond à aucune option donne Number('') = 0, et on enverrait alors
  // seats: 0 à l'API.
  function bornerPlaces(demande: number, creneau: Slot): number {
    if (!Number.isInteger(demande)) return 1

    return Math.max(1, Math.min(demande, placesMaximum(creneau)))
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
      const places = cours.course_id === idDernierCours ? etat.places : 1
      idDernierCours = cours.course_id

      changer({ ecran: { nom: 'creneaux', cours }, creneaux: { etat: 'en-chargement' }, places })
      chargerCreneaux(cours)
    },

    choisirCreneau(creneau: Slot): void {
      if (etat.ecran.nom !== 'creneaux') return
      if (creneau.seats_available <= 0) return

      changer({
        ecran: {
          nom: 'coordonnees',
          cours: etat.ecran.cours,
          creneau,
          placesMaximum: placesMaximum(creneau),
        },

        // Le créneau précédent permettait peut-être plus de places que
        // celui-ci : on ramène le nombre demandé dans les limites.
        places: bornerPlaces(etat.places, creneau),
      })
    },

    changerPlaces(demande: number): void {
      if (etat.ecran.nom !== 'coordonnees') return

      changer({ places: bornerPlaces(demande, etat.ecran.creneau) })
    },

    saisir(champ: keyof Saisie, valeur: string): void {
      changer({ saisie: { ...etat.saisie, [champ]: valeur } })
    },

    revenir(): void {
      if (etat.ecran.nom === 'coordonnees') {
        changer({ ecran: { nom: 'creneaux', cours: etat.ecran.cours } })
        return
      }

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
