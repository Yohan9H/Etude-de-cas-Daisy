// Le tunnel : il possède l'état du parcours de réservation et toutes ses
// transitions.
//
// Il ne touche jamais au DOM et n'importe aucune de ses dépendances : l'API,
// l'hôte et l'horloge lui sont donnés à la création. C'est ce qui permet de
// le tester sans navigateur, sans serveur et sans dépendre de la date du jour.

import type { Booking, CorpsReservation, Course, Erreur as ErreurApi, Resultat, Slot, Studio } from './api'

// --- Les dépendances ---------------------------------------------------------

export type ApiTunnel = {
  getCourses(): Promise<Resultat<{ courses: Course[] }>>
  getSlots(idCours: string, depuis: Date, jusqua: Date): Promise<Resultat<{ slots: Slot[] }>>
  postBooking(corps: CorpsReservation): Promise<Resultat<Booking>>
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
  // à la recalculer. `echec` : le dernier envoi a échoué sans être un refus.
  // Il disparaît avec l'écran, au retour comme au prochain envoi.
  | { nom: 'coordonnees'; cours: Course; creneau: Slot; placesMaximum: number; echec?: EchecEnvoi }
  | { nom: 'envoi'; cours: Course; creneau: Slot }

  | ({ nom: 'confirmation' } & Confirmation)

  // Le refus n'est pas une erreur technique : c'est un écran à part entière.
  // `creneau` porte les places restantes annoncées par le refus, puis par les
  // créneaux rechargés, jamais celles, périmées, d'avant la saisie. Les alternatives restent vides tant que les
  // créneaux ne sont pas rechargés, plutôt que périmées.
  | { nom: 'place-partie'; cours: Course; creneau: Slot; alternatives: Slot[] }
  | { nom: 'creneau-annule'; cours: Course }

// `email` est celui de la réservation : la saisie, elle, est effacée dès
// qu'on quitte l'écran de confirmation, avant que l'hôte n'ait confirmé la
// fermeture.
export type Confirmation = { cours: Course; creneau: Slot; code: string; total: number; email: string }

// Ce que l'envoi aurait affiché si la page hôte n'avait pas refermé le tunnel,
// quand la personne doit le voir : la confirmation, ou ses coordonnées avec
// l'échec `sans-reponse`.
export type EcranEnAttente = Extract<Ecran, { nom: 'confirmation' | 'coordonnees' }>

// Un envoi qui échoue sans être un refus. Le tunnel dit ce qui s'est passé, le
// rendu choisit les mots.
export type EchecEnvoi =
  // `places` : la demande une fois ramenée, figée au moment de l'échec.
  | { type: 'trop-de-places'; plafond: number; places: number }
  | { type: 'trop-de-requetes' }

  // On ne sait pas si la réservation a été créée.
  | { type: 'sans-reponse' }
  | { type: 'indisponible' }

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

// Un message par champ invalide. Absent : le champ est bon.
export type Erreurs = Partial<Record<keyof Saisie, string>>

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

  // Les champs refusés au dernier envoi. Elles restent affichées pendant
  // qu'on corrige, jusqu'au prochain envoi.
  erreurs: Erreurs

  // Un champ en moins à l'étape où on perd 60 % des gens : le téléphone
  // n'est demandé que si l'atelier l'exige.
  telephoneDemande: boolean

  // L'envoi s'est terminé pendant que la page hôte avait refermé le tunnel, et
  // sa réponse ne doit pas être tue. On ne rouvre pas de nous-mêmes : seul un
  // clic de la personne le fait, et c'est alors cet écran qu'on lui montre.
  // null sinon.
  ecranEnAttente: EcranEnAttente | null
}

// La spec plafonne la fenêtre à 90 jours, au-delà c'est un 400.
// On demande le maximum : certains ateliers ne proposent qu'une date par mois,
// et une fenêtre plus courte renverrait parfois une liste vide à tort.
export const FENETRE_JOURS = 90

const UN_JOUR_MS = 24 * 60 * 60 * 1000

const SAISIE_VIDE: Saisie = { first_name: '', last_name: '', email: '', phone: '', notes: '' }

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
    saisie: SAISIE_VIDE,
    erreurs: {},
    telephoneDemande: atelier.booking_policy.requires_phone,
    ecranEnAttente: null,
  }
  const abonnes = new Set<() => void>()

  // Numéro de la dernière demande de créneaux. Une réponse qui ne porte pas
  // ce numéro est périmée : la personne a choisi un autre cours entre-temps,
  // et ses créneaux ne doivent pas écraser ceux qu'elle regarde.
  let derniereDemandeCreneaux = 0

  // Le verrou d'envoi. La création met 1,5 à 4 s : sans lui, une réservation
  // relancée pendant l'attente en crée une seconde. L'écran d'attente ne
  // suffit pas, la page hôte peut refermer le tunnel et on peut le rouvrir
  // avant la réponse : on garde de quoi y remettre l'écran d'attente.
  let envoiEnCours: { cours: Course; creneau: Slot } | null = null

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

    const liste = creneauxAVenir(resultat.donnees.slots)
    const ecran = etat.ecran

    // L'écran du refus attendait ces créneaux pour proposer ses alternatives :
    // même changement, un seul redessin. Ils sont plus récents que le refus :
    // les places restantes du créneau refusé en sont reprises.
    if (ecran.nom === 'place-partie' && ecran.cours.course_id === cours.course_id) {
      const creneauRefuse = liste.find((creneau) => creneau.slot_id === ecran.creneau.slot_id) ?? ecran.creneau

      changer({
        creneaux: { etat: 'prete', liste },
        ecran: { ...ecran, creneau: creneauRefuse, alternatives: alternatives(creneauRefuse, liste) },
      })
      return
    }

    changer({ creneaux: { etat: 'prete', liste } })
  }

  // Les trois plus proches : au-delà, on renvoie vers la liste complète. Le
  // créneau refusé n'en fait pas partie, même s'il lui reste des places : on
  // propose déjà de réduire la demande.
  function alternatives(creneauRefuse: Slot, creneaux: Slot[]): Slot[] {
    return creneaux
      .filter((creneau) => creneau.slot_id !== creneauRefuse.slot_id && creneau.seats_available > 0)
      .slice(0, 3)
  }

  // L'API peut renvoyer des créneaux déjà passés : on ne les propose pas.
  function creneauxAVenir(creneaux: Slot[]): Slot[] {
    const maintenant = horloge().getTime()

    return creneaux
      .filter((creneau) => new Date(creneau.starts_at).getTime() > maintenant)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }

  // La réservation est faite : on ne garde pas les coordonnées pour la
  // prochaine ouverture du widget, quelle que soit la façon de quitter la
  // confirmation. Avant la fin, au contraire, la saisie survit à la fermeture.
  function saisieEffacee(): Partial<EtatTunnel> {
    return { saisie: SAISIE_VIDE, erreurs: {} }
  }

  // Même code HTTP pour deux refus, causes différentes : la place est partie,
  // ou le cours lui-même n'a plus lieu. null : ce n'est pas un refus.
  function ecranDeRefus(erreur: ErreurApi, cours: Course, creneau: Slot): Ecran | null {
    if (erreur.code === 'slot_full') {
      const restantes = erreur.available ?? 0
      return { nom: 'place-partie', cours, creneau: { ...creneau, seats_available: restantes }, alternatives: [] }
    }

    if (erreur.code === 'slot_cancelled') return { nom: 'creneau-annule', cours }

    return null
  }

  function echecEnvoi(erreur: ErreurApi, demande: number, creneau: Slot): EchecEnvoi {
    // On ramène la demande dans les limites plutôt que de laisser la personne
    // deviner combien elle a le droit de réserver. Le plafond est celui chargé
    // au démarrage, peut-être périmé : bug connu, hors périmètre
    // (`.scratch/traduction-erreurs-api/issues/01-…`).
    if (erreur.code === 'too_many_seats') {
      return {
        type: 'trop-de-places',
        plafond: atelier.booking_policy.max_seats_per_booking,
        places: bornerPlaces(demande, creneau),
      }
    }

    if (erreur.statut === 429) return { type: 'trop-de-requetes' }

    // Pas de réponse du tout : la réservation a peut-être été créée malgré
    // tout. L'API n'a pas de clé d'idempotence, et pas d'endpoint pour
    // vérifier. On ne réessaie donc JAMAIS tout seul, et on le dit honnêtement.
    if (erreur.statut === null) return { type: 'sans-reponse' }

    return { type: 'indisponible' }
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

      // Un envoi terminé pendant que le tunnel était fermé passe avant tout :
      // la personne doit savoir qu'elle a sa place, ou qu'elle l'a peut-être.
      // Une fois affiché, c'est un écran comme un autre : la confirmation est
      // effacée de la même façon, l'échec disparaît au retour ou au prochain
      // envoi.
      if (etat.ecranEnAttente !== null) {
        changer({ ecran: etat.ecranEnAttente, ecranEnAttente: null })
        return
      }

      // Rouvert avant la réponse : on retrouve l'attente, et c'est elle qui
      // affichera la réponse. Sur la liste des cours, un nouvel envoi serait
      // ignoré sans un mot.
      if (envoiEnCours !== null) {
        changer({ ecran: { nom: 'envoi', ...envoiEnCours } })
        return
      }

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

      // Pendant l'envoi, fermer ne servirait à rien : la requête est partie
      // et la réservation sera créée. Mieux vaut laisser l'attente se terminer.
      if (etat.ecran.nom === 'envoi') return

      if (etat.ecran.nom === 'confirmation') changer(saisieEffacee())

      hote.demanderFermeture()
    },

    terminer(): void {
      if (etat.ecran.nom !== 'confirmation') return

      changer(saisieEffacee())
      hote.demanderFermeture()
    },

    choisirCours(cours: Course): void {
      const places = cours.course_id === idDernierCours ? etat.places : 1
      idDernierCours = cours.course_id

      changer({ ecran: { nom: 'creneaux', cours }, creneaux: { etat: 'en-chargement' }, places })
      chargerCreneaux(cours)
    },

    // Depuis l'écran du refus aussi : une alternative, ou le créneau refusé
    // lui-même avec les places qui lui restent, se choisit en un clic.
    choisirCreneau(creneau: Slot): void {
      if (etat.ecran.nom !== 'creneaux' && etat.ecran.nom !== 'place-partie') return
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

    async envoyer(): Promise<void> {
      const ecran = etat.ecran
      if (ecran.nom !== 'coordonnees' || envoiEnCours !== null) return

      const { cours, creneau } = ecran
      const { saisie, places } = etat
      const erreurs = valider(saisie, etat.telephoneDemande)

      if (Object.keys(erreurs).length > 0) {
        // L'échec du dernier envoi ne vaut plus : on en tente un nouveau.
        changer({ ecran: { nom: 'coordonnees', cours, creneau, placesMaximum: ecran.placesMaximum }, erreurs })
        return
      }

      const email = saisie.email.trim()

      envoiEnCours = { cours, creneau }
      changer({ ecran: { nom: 'envoi', cours, creneau }, erreurs: {} })

      let resultat: Resultat<Booking>

      try {
        resultat = await api.postBooking({
          slot_id: creneau.slot_id,
          seats: places,
          customer: {
            first_name: saisie.first_name.trim(),
            last_name: saisie.last_name.trim(),
            email,
            phone: saisie.phone.trim() || undefined,
          },
          notes: saisie.notes.trim() || undefined,
        })
      } finally {
        envoiEnCours = null
      }

      // La page hôte a pu refermer le tunnel pendant l'attente : la réponse n'a
      // alors plus d'écran où s'afficher.
      const attenteAffichee = etat.ecran.nom === 'envoi'

      if (resultat.ok) {
        const confirmation: Confirmation = {
          cours,
          creneau,
          code: resultat.donnees.confirmation_code,
          total: resultat.donnees.total_cents,
          email,
        }

        // La réservation existe : on la garde pour la prochaine ouverture
        // plutôt que de la perdre.
        if (!attenteAffichee) {
          changer({ ecranEnAttente: { nom: 'confirmation', ...confirmation } })
          return
        }

        changer({ ecran: { nom: 'confirmation', ...confirmation } })
        return
      }

      // Hors refus, on retourne au formulaire, saisie intacte.
      const coordonnees: Ecran = { nom: 'coordonnees', cours, creneau, placesMaximum: placesMaximum(creneau) }
      const echec = echecEnvoi(resultat.erreur, places, creneau)

      if (!attenteAffichee) {
        // Sans réponse, la réservation existe peut-être. Si on ne le disait
        // pas, la personne renverrait sans se méfier, et l'atelier recevrait
        // peut-être une seconde réservation : on le garde pour la prochaine
        // ouverture.
        if (echec.type === 'sans-reponse') {
          changer({ ecranEnAttente: { ...coordonnees, echec } })
          return
        }

        // Les autres échecs, le serveur y a répondu et rien n'a été créé : à
        // la réouverture, la personne retrouve sa saisie comme après toute
        // fermeture.
        return
      }

      // Un refus : les créneaux affichés datent d'avant la saisie, on les
      // recharge pour ne proposer que des dates qui existent encore.
      const refus = ecranDeRefus(resultat.erreur, cours, creneau)

      if (refus) {
        changer({ ecran: refus, creneaux: { etat: 'en-chargement' } })
        chargerCreneaux(cours)
        return
      }

      // /studio disait que le téléphone n'était pas demandé, le serveur dit
      // l'inverse : l'artisan a changé sa politique depuis le chargement. On
      // fait apparaître le champ plutôt que d'afficher une erreur opaque.
      if (resultat.erreur.code === 'phone_required') {
        changer({
          ecran: coordonnees,
          telephoneDemande: true,
          erreurs: { phone: 'L’atelier demande désormais un numéro de téléphone pour réserver.' },
        })
        return
      }

      changer({
        ecran: { ...coordonnees, echec },
        places: echec.type === 'trop-de-places' ? echec.places : places,
      })
    },

    revenir(): void {
      if (etat.ecran.nom === 'coordonnees') {
        changer({ ecran: { nom: 'creneaux', cours: etat.ecran.cours }, erreurs: {} })
        return
      }

      if (etat.ecran.nom !== 'creneaux') return

      changer({ ecran: { nom: 'cours' } })
    },

    // Les créneaux ont été remis en chargement par le refus, dans le même
    // changement que son écran : on ne peut tomber que sur ceux rechargés, ou
    // sur leur chargement, jamais sur ceux d'avant le refus.
    voirToutesLesDates(): void {
      if (etat.ecran.nom !== 'place-partie' && etat.ecran.nom !== 'creneau-annule') return

      changer({ ecran: { nom: 'creneaux', cours: etat.ecran.cours } })
    },

    hoteAFerme(): void {
      // La page hôte a pu refermer d'elle-même sur la confirmation.
      const efface = etat.ecran.nom === 'confirmation' ? saisieEffacee() : {}

      changer({ ecran: { nom: 'bouton' }, ...efface })
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

// --- Validation --------------------------------------------------------------

// Volontairement permissive : on vérifie qu'il y a un @ entouré de texte et un
// point après. Les expressions très strictes rejettent de vraies adresses, et
// le seul test qui fait foi est l'email de confirmation qui arrive ou non.
function emailPlausible(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)
}

// Un message par champ : un gabarit du type « {libellé} est nécessaire »
// donne « Nom est nécessaire », qui n'est pas du français.
function valider(saisie: Saisie, telephoneDemande: boolean): Erreurs {
  const erreurs: Erreurs = {}

  if (!saisie.first_name.trim()) erreurs.first_name = 'Indiquez votre prénom.'
  if (!saisie.last_name.trim()) erreurs.last_name = 'Indiquez votre nom.'

  const email = saisie.email.trim()

  if (!email) {
    erreurs.email = 'Indiquez votre adresse email, la confirmation y sera envoyée.'
  } else if (!emailPlausible(email)) {
    erreurs.email = 'Cette adresse ne semble pas valide.'
  }

  // On dit pourquoi : un champ obligatoire sans raison est un champ qu'on
  // abandonne, à l'étape où on perd déjà 60 % des gens.
  if (telephoneDemande && !saisie.phone.trim()) {
    erreurs.phone = 'L’atelier a besoin d’un numéro pour vous prévenir en cas de changement.'
  }

  return erreurs
}

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
