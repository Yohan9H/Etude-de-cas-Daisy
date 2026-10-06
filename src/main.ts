// Point d'entrée du widget.
//
// Deux règles de discipline, tenues partout :
//   - un seul objet d'état, une seule fonction qui dessine. Aucune
//     modification du DOM ailleurs que dans les fonctions d'écran ;
//   - jamais innerHTML avec une donnée de l'API. Un nom de cours peut
//     contenir du HTML. On passe par createElement et textContent.

import './style.css'

import { getStudio, getCourses, getSlots, postBooking } from './api'
import type { Studio, Course, Slot, Erreur as ErreurApi } from './api'
import { envoyer, ecouter, estDansUneIframe } from './pont'

// --- L'état ------------------------------------------------------------------

type Ecran =
  | { nom: 'bouton' }
  | { nom: 'cours' }
  | { nom: 'creneaux'; cours: Course }
  | { nom: 'coordonnees'; cours: Course; creneau: Slot }
  | { nom: 'envoi'; cours: Course; creneau: Slot }
  | { nom: 'confirme'; creneau: Slot; code: string; total: number }

  // Le refus n'est pas une erreur technique : c'est un écran à part entière.
  | { nom: 'place-partie'; cours: Course; creneau: Slot; restantes: number }
  | { nom: 'creneau-annule'; cours: Course }

type Saisie = {
  first_name: string
  last_name: string
  email: string
  phone: string
  notes: string
}

type Etat = {
  ecran: Ecran

  studio: Studio | null
  cours: Course[]
  creneaux: Slot[]

  // Conservée hors des écrans : quand le refus arrivera, l'utilisateur ne
  // devra pas avoir à ressaisir ce qu'il vient de taper.
  saisie: Saisie
  erreurs: Partial<Record<keyof Saisie, string>>

  // Erreur qui ne porte sur aucun champ en particulier (réseau, 429, 500).
  erreurEnvoi: string | null

  // Le serveur peut exiger un téléphone alors que /studio disait le contraire :
  // l'artisan a pu changer sa politique après le chargement de la page.
  telephoneExige: boolean

  // Nombre de places demandées. Borné par l'atelier (max_seats_per_booking)
  // ET par le créneau (seats_available).
  places: number

  // Verrou. La création met 1,5 à 4 s : sans lui, un double-clic crée
  // deux réservations.
  envoiEnCours: boolean

  chargement: boolean
  erreur: string | null
}

const etat: Etat = {
  ecran: { nom: 'bouton' },

  studio: null,
  cours: [],
  creneaux: [],

  saisie: { first_name: '', last_name: '', email: '', phone: '', notes: '' },
  erreurs: {},
  erreurEnvoi: null,
  telephoneExige: false,
  places: 1,
  envoiEnCours: false,

  chargement: false,
  erreur: null,
}

const racine = document.getElementById('app')!

// La spec plafonne la fenêtre à 90 jours, au-delà c'est un 400.
// On demande le maximum : certains ateliers ne proposent qu'une date par mois,
// et une fenêtre plus courte renverrait parfois une liste vide à tort.
const FENETRE_JOURS = 90

// En dessous de ce nombre, on affiche les places restantes. Au-dessus on se
// tait : « 8 places restantes » est du bruit, et un décompte affiché partout
// ressemble à de la pression artificielle.
const SEUIL_RARETE = 3

// --- Petits outils de DOM ----------------------------------------------------

function vider(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild)
  }
}

function creer<B extends keyof HTMLElementTagNameMap>(
  balise: B,
  classe?: string,
  texte?: string,
): HTMLElementTagNameMap[B] {
  const element = document.createElement(balise)

  if (classe) element.className = classe

  // textContent et non innerHTML : ce qui arrive ici vient parfois de l'API.
  if (texte) element.textContent = texte

  return element
}

// --- Formatage ---------------------------------------------------------------

// L'API donne des centimes, en nombre entier. On ne calcule jamais en décimal.
function formaterPrix(centimes: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: etat.studio?.currency ?? 'EUR',
    maximumFractionDigits: centimes % 100 === 0 ? 0 : 2,
  }).format(centimes / 100)
}

// TOUJOURS le fuseau de l'atelier, jamais celui du visiteur. Le cours a lieu à
// 14 h heure de Paris ; quelqu'un en vacances au Québec doit lire 14 h, pas 8 h.
function fuseauAtelier(): string {
  return etat.studio?.timezone ?? 'Europe/Paris'
}

function formaterJour(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseauAtelier(),
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: fuseauAtelier(),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formaterDuree(minutes: number): string {
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60

  if (heures === 0) return `${reste} min`
  if (reste === 0) return `${heures} h`

  return `${heures} h ${reste}`
}

function etiquetteNiveau(niveau: string): string {
  const connus: Record<string, string> = {
    debutant: 'Débutant',
    intermediaire: 'Intermédiaire',
    avance: 'Avancé',
  }

  // Un niveau inconnu ne doit pas faire disparaître l'information.
  return connus[niveau] ?? niveau
}

// Couleur de remplacement, déduite du nom du cours. Elle est posée sous
// chaque vignette et reste visible quand l'image est absente ou ne charge pas.
// Déterministe : le même cours a toujours la même couleur, à chaque visite.
function couleurDepuisNom(nom: string): string {
  let somme = 0

  for (let i = 0; i < nom.length; i++) {
    somme = (somme * 31 + nom.charCodeAt(i)) % 360
  }

  return `hsl(${somme} 38% 84%)`
}

// --- Morceaux réutilisables --------------------------------------------------

// Le logo de l'atelier, réglé dans son back-office et renvoyé par l'API.
// Renvoie null s'il n'y en a pas : l'en-tête s'affiche alors sans.
function logoAtelier(): HTMLElement | null {
  const url = etat.studio?.branding.logo_url

  if (!url) return null

  const image = creer('img', 'logo')

  image.src = url
  image.alt = etat.studio?.name ?? ''

  // Même principe que les vignettes des cours : si l'image ne charge pas, on
  // la retire au lieu d'afficher l'icône d'image cassée du navigateur.
  image.addEventListener('error', () => image.remove())

  return image
}

function enteteTunnel(titre: string, retour?: () => void): HTMLElement {
  const barre = creer('div', 'tunnel-entete')

  // Barre pleine largeur pour le trait du bas, contenu borné à la même
  // largeur que la liste pour que tout soit aligné sur grand écran.
  const entete = creer('div', 'bande')
  barre.appendChild(entete)

  if (retour) {
    const bouton = creer('button', 'bouton-icone', '←')
    bouton.setAttribute('aria-label', 'Revenir en arrière')
    bouton.addEventListener('click', retour)
    entete.appendChild(bouton)
  }

  const logo = logoAtelier()
  if (logo) entete.appendChild(logo)

  entete.appendChild(creer('p', 'tunnel-titre', titre))

  const fermer = creer('button', 'bouton-icone', '✕')
  fermer.setAttribute('aria-label', 'Fermer')
  fermer.addEventListener('click', fermerTunnel)
  entete.appendChild(fermer)

  return barre
}

function messageCentral(titre: string, detail: string, action?: () => void): HTMLElement {
  const zone = creer('div', 'message bande')

  zone.appendChild(creer('p', 'message-titre', titre))
  zone.appendChild(creer('p', 'message-detail', detail))

  if (action) {
    const bouton = creer('button', 'bouton-secondaire', 'Réessayer')
    bouton.addEventListener('click', action)
    zone.appendChild(bouton)
  }

  return zone
}

// La vignette de remplacement est toujours dessous, l'image passe par-dessus
// quand elle charge. Si elle échoue, on la retire et le remplacement reste.
// Dans le faux serveur aucune image ne charge : c'est le chemin normal, pas
// un cas d'exception.
function vignette(cours: Course): HTMLElement {
  const boite = creer('div', 'vignette')

  boite.style.backgroundColor = couleurDepuisNom(cours.name)
  boite.appendChild(creer('span', 'vignette-lettre', cours.name.trim().charAt(0).toUpperCase()))

  if (cours.image_url) {
    const image = creer('img', 'vignette-image')

    image.src = cours.image_url
    image.alt = ''
    image.loading = 'lazy'
    image.addEventListener('error', () => image.remove())

    boite.appendChild(image)
  }

  return boite
}

function carteCours(cours: Course): HTMLElement {
  // Un vrai <button> : navigable au clavier et annoncé comme cliquable,
  // ce qu'un <div> avec un onclick ne serait pas.
  const carte = creer('button', 'carte')

  carte.appendChild(vignette(cours))

  const texte = creer('div', 'carte-texte')

  // Le nom peut être très long. On le laisse passer à la ligne, limité à
  // deux lignes par le CSS, plutôt que de le couper au milieu d'un mot.
  texte.appendChild(creer('p', 'carte-nom', cours.name))

  const meta = creer('p', 'carte-meta')
  meta.textContent = `${formaterDuree(cours.duration_minutes)} · ${etiquetteNiveau(cours.level)}`
  texte.appendChild(meta)

  // La description peut être vide ou faire 800 caractères. Dans les deux cas
  // la carte doit garder la même allure : on n'affiche rien si elle est vide,
  // et le CSS limite à deux lignes sinon.
  const description = cours.description.trim()

  if (description) {
    texte.appendChild(creer('p', 'carte-description', description))
  }

  // « À partir de » parce que le prix varie d'un créneau à l'autre (tarif
  // week-end). Le prix qui fait foi est celui du créneau, affiché à l'étape
  // suivante.
  texte.appendChild(creer('p', 'carte-prix', `À partir de ${formaterPrix(cours.price_cents)}`))

  carte.appendChild(texte)

  carte.addEventListener('click', () => {
    etat.ecran = { nom: 'creneaux', cours }

    // On repart de zéro : les créneaux affichés étaient ceux d'un autre cours.
    etat.creneaux = []

    dessiner()
    chargerCreneaux(cours)
  })

  return carte
}

function ligneCreneau(creneau: Slot, surChoix: (creneau: Slot) => void): HTMLElement {
  const complet = creneau.seats_available <= 0

  const ligne = creer('button', 'creneau')

  // Affiché mais désactivé, jamais caché. Un cours dont tous les créneaux
  // disparaissent donne l'impression qu'il n'a aucune date — et l'artisan
  // croit son widget cassé.
  ligne.disabled = complet

  const gauche = creer('div', 'creneau-quand')
  gauche.appendChild(creer('p', 'creneau-jour', formaterJour(creneau.starts_at)))
  gauche.appendChild(creer('p', 'creneau-heure', formaterHeure(creneau.starts_at)))
  ligne.appendChild(gauche)

  const droite = creer('div', 'creneau-etat')

  // Le prix du CRÉNEAU, pas celui du cours : il varie (tarif week-end).
  // C'est aussi celui que l'API facturera.
  droite.appendChild(creer('p', 'creneau-prix', formaterPrix(creneau.price_cents)))

  const reste = placesRestantes(creneau)
  if (reste) droite.appendChild(creer('p', complet ? 'creneau-complet' : 'creneau-rare', reste))

  ligne.appendChild(droite)

  if (!complet) {
    ligne.addEventListener('click', () => surChoix(creneau))
  }

  return ligne
}

// Renvoie null quand il reste assez de places : dans ce cas on n'affiche rien.
function placesRestantes(creneau: Slot): string | null {
  const libres = creneau.seats_available

  if (libres <= 0) return 'Complet'
  if (libres === 1) return 'Dernière place'
  if (libres <= SEUIL_RARETE) return `Plus que ${libres} places`

  return null
}

type DefinitionChamp = {
  cle: keyof Saisie
  libelle: string
  obligatoire: boolean

  type?: string
  autocomplete?: string
  inputmode?: string
  multiligne?: boolean
  aide?: string

  // Un message par champ : un gabarit du type « {libellé} est nécessaire »
  // donne « Nom est nécessaire », qui n'est pas du français.
  siManquant?: string
}

// Les champs demandés dépendent de la politique de l'atelier : le téléphone
// n'apparaît que si `requires_phone` est vrai, ou si le serveur l'a réclamé
// en cours de route (voir `telephoneExige`). Un champ en moins à l'étape où
// on perd 60 % des gens, c'est la modification la plus rentable du tunnel.
function champsDemandes(): DefinitionChamp[] {
  const champs: DefinitionChamp[] = [
    {
      cle: 'first_name',
      libelle: 'Prénom',
      obligatoire: true,
      autocomplete: 'given-name',
      siManquant: 'Indiquez votre prénom.',
    },
    {
      cle: 'last_name',
      libelle: 'Nom',
      obligatoire: true,
      autocomplete: 'family-name',
      siManquant: 'Indiquez votre nom.',
    },
    {
      cle: 'email',
      libelle: 'Email',
      obligatoire: true,
      type: 'email',
      autocomplete: 'email',
      inputmode: 'email',
      aide: 'Votre confirmation y sera envoyée.',
      siManquant: 'Indiquez votre adresse email, la confirmation y sera envoyée.',
    },
  ]

  if (etat.studio?.booking_policy.requires_phone || etat.telephoneExige) {
    champs.push({
      cle: 'phone',
      libelle: 'Téléphone',
      obligatoire: true,
      type: 'tel',
      autocomplete: 'tel',
      inputmode: 'tel',
      aide: 'En cas de changement de dernière minute.',

      // On dit pourquoi : un champ obligatoire sans raison est un champ qu'on
      // abandonne, à l'étape où on perd déjà 60 % des gens.
      siManquant: 'L’atelier a besoin d’un numéro pour vous prévenir en cas de changement.',
    })
  }

  champs.push({
    cle: 'notes',
    libelle: 'Précisions (facultatif)',
    obligatoire: false,
    multiligne: true,
  })

  return champs
}

function champ(definition: DefinitionChamp): HTMLElement {
  const bloc = creer('div', 'champ')
  const id = `champ-${definition.cle}`
  const idErreur = `${id}-erreur`

  const etiquette = creer('label', 'champ-libelle', definition.libelle)
  etiquette.htmlFor = id
  bloc.appendChild(etiquette)

  const saisie: HTMLInputElement | HTMLTextAreaElement = definition.multiligne
    ? creer('textarea', 'champ-saisie')
    : creer('input', 'champ-saisie')

  saisie.id = id
  saisie.name = definition.cle
  saisie.value = etat.saisie[definition.cle]

  if (!definition.multiligne) {
    const entree = saisie as HTMLInputElement
    entree.type = definition.type ?? 'text'

    // Ces attributs déclenchent le bon clavier et le remplissage automatique
    // sur mobile. Quelques lignes, sur l'étape où on perd le plus de monde.
    if (definition.autocomplete) entree.setAttribute('autocomplete', definition.autocomplete)
    if (definition.inputmode) entree.inputMode = definition.inputmode
  } else {
    ;(saisie as HTMLTextAreaElement).rows = 3
  }

  if (definition.cle === 'email') {
    saisie.setAttribute('autocapitalize', 'none')
    saisie.spellcheck = false
  }

  const erreur = etat.erreurs[definition.cle]

  if (erreur) {
    saisie.setAttribute('aria-invalid', 'true')
    saisie.setAttribute('aria-describedby', idErreur)
  }

  // On écrit dans l'état à chaque frappe, mais on NE redessine PAS :
  // reconstruire le DOM ferait perdre le curseur à chaque lettre.
  saisie.addEventListener('input', () => {
    etat.saisie[definition.cle] = saisie.value
  })

  bloc.appendChild(saisie)

  if (definition.aide && !erreur) {
    bloc.appendChild(creer('p', 'champ-aide', definition.aide))
  }

  if (erreur) {
    const message = creer('p', 'champ-erreur', erreur)
    message.id = idErreur

    // Annoncé par les lecteurs d'écran au moment où il apparaît.
    message.setAttribute('role', 'alert')

    bloc.appendChild(message)
  }

  return bloc
}

// Deux limites se cumulent : celle que l'atelier s'impose, et ce qui reste
// réellement sur ce créneau. C'est la plus basse qui s'applique.
function placesMaximum(creneau: Slot): number {
  const plafondAtelier = etat.studio?.booking_policy.max_seats_per_booking ?? 1

  return Math.max(1, Math.min(plafondAtelier, creneau.seats_available))
}

function selecteurPlaces(creneau: Slot, surChangement: () => void): HTMLElement | null {
  const maximum = placesMaximum(creneau)

  // Une seule place possible : un sélecteur à un choix est du bruit.
  if (maximum <= 1) return null

  const bloc = creer('div', 'champ')

  const etiquette = creer('label', 'champ-libelle', 'Nombre de places')
  etiquette.htmlFor = 'champ-places'
  bloc.appendChild(etiquette)

  // Un <select> natif, pas une liste déroulante maison : sur mobile le
  // navigateur affiche son propre sélecteur, bien plus confortable.
  const liste = creer('select', 'champ-saisie')
  liste.id = 'champ-places'

  for (let n = 1; n <= maximum; n++) {
    const choix = creer('option', undefined, n === 1 ? '1 personne' : `${n} personnes`)
    choix.value = String(n)
    choix.selected = n === etat.places
    liste.appendChild(choix)
  }

  liste.addEventListener('change', () => {
    const choisi = Number(liste.value)

    // On ne fait pas confiance à la valeur brute : un <select> dont la valeur
    // ne correspond à aucune option renvoie une chaîne vide, et Number('')
    // vaut 0. On enverrait alors seats: 0 à l'API.
    etat.places = Number.isFinite(choisi) && choisi >= 1 ? Math.min(choisi, maximum) : 1

    surChangement()
  })

  bloc.appendChild(liste)

  if (creneau.seats_available < (etat.studio?.booking_policy.max_seats_per_booking ?? 1)) {
    bloc.appendChild(
      creer('p', 'champ-aide', `Il reste ${creneau.seats_available} places sur ce créneau.`),
    )
  }

  return bloc
}

function recapitulatif(cours: Course, creneau: Slot): HTMLElement {
  const boite = creer('div', 'recap')

  boite.appendChild(creer('p', 'recap-cours', cours.name))
  boite.appendChild(
    creer(
      'p',
      'recap-quand',
      `${formaterJour(creneau.starts_at)} à ${formaterHeure(creneau.starts_at)} · ${formaterDuree(cours.duration_minutes)}`,
    ),
  )
  const total = creneau.price_cents * etat.places

  boite.appendChild(creer('p', 'recap-prix', formaterPrix(total)))

  // Le détail n'apparaît que s'il apporte quelque chose.
  if (etat.places > 1) {
    boite.appendChild(
      creer(
        'p',
        'recap-detail-prix',
        `${etat.places} × ${formaterPrix(creneau.price_cents)}`,
      ),
    )
  }

  const heures = etat.studio?.booking_policy.cancellation_hours

  // Dit avant l'engagement, pas après : c'est ce qui lève le frein au moment
  // où l'utilisateur hésite à donner ses coordonnées.
  if (heures) {
    boite.appendChild(
      creer('p', 'recap-annulation', `Annulation gratuite jusqu'à ${heures} h avant la séance.`),
    )
  }

  return boite
}

// --- Les écrans --------------------------------------------------------------

function ecranBouton(): HTMLElement {
  const zone = creer('div', 'entree')
  const bouton = creer('button', 'bouton-principal', 'Réserver un atelier')

  bouton.addEventListener('click', ouvrirTunnel)
  zone.appendChild(bouton)

  return zone
}

function ecranCours(): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(etat.studio?.name ?? 'Réserver'))

  const corps = creer('div', 'tunnel-corps')

  if (etat.chargement) {
    corps.appendChild(messageCentral('Chargement…', 'Nous récupérons les ateliers proposés.'))
    zone.appendChild(corps)
    return zone
  }

  if (etat.erreur) {
    corps.appendChild(messageCentral('Impossible d’afficher les ateliers', etat.erreur, chargerCours))
    zone.appendChild(corps)
    return zone
  }

  if (etat.cours.length === 0) {
    corps.appendChild(
      messageCentral(
        'Aucun atelier pour le moment',
        'Revenez bientôt, ou contactez directement l’atelier.',
      ),
    )
    zone.appendChild(corps)
    return zone
  }

  const liste = creer('div', 'liste bande')

  for (const cours of etat.cours) {
    liste.appendChild(carteCours(cours))
  }

  corps.appendChild(liste)
  zone.appendChild(corps)

  return zone
}

function ecranCreneaux(cours: Course): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(
    enteteTunnel(cours.name, () => {
      etat.ecran = { nom: 'cours' }
      dessiner()
    }),
  )

  const corps = creer('div', 'tunnel-corps')

  if (etat.chargement) {
    corps.appendChild(messageCentral('Chargement…', 'Nous récupérons les prochaines dates.'))
    zone.appendChild(corps)
    return zone
  }

  if (etat.erreur) {
    corps.appendChild(
      messageCentral('Impossible d’afficher les dates', etat.erreur, () => chargerCreneaux(cours)),
    )
    zone.appendChild(corps)
    return zone
  }

  if (etat.creneaux.length === 0) {
    corps.appendChild(
      messageCentral(
        'Aucune date programmée',
        `Aucune séance n’est prévue dans les ${FENETRE_JOURS} prochains jours.`,
      ),
    )
    zone.appendChild(corps)
    return zone
  }

  const liste = creer('div', 'liste bande')

  for (const creneau of etat.creneaux) {
    liste.appendChild(
      ligneCreneau(creneau, (choisi) => {
        // Le créneau précédent permettait peut-être plus de places que
        // celui-ci : on ramène le nombre demandé dans les limites.
        etat.places = Math.min(etat.places, placesMaximum(choisi))

        etat.ecran = { nom: 'coordonnees', cours, creneau: choisi }
        dessiner()
      }),
    )
  }

  corps.appendChild(liste)
  zone.appendChild(corps)

  return zone
}

function ecranCoordonnees(cours: Course, creneau: Slot): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(
    enteteTunnel('Vos coordonnées', () => {
      etat.ecran = { nom: 'creneaux', cours }
      etat.erreurs = {}
      etat.erreurEnvoi = null
      dessiner()
    }),
  )

  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande formulaire')

  bande.appendChild(recapitulatif(cours, creneau))

  // Erreur qui ne porte sur aucun champ : réseau, 429, 500. Elle est annoncée
  // aux lecteurs d'écran et placée avant le formulaire, pas après le bouton.
  if (etat.erreurEnvoi) {
    const bandeau = creer('p', 'bandeau-erreur', etat.erreurEnvoi)
    bandeau.setAttribute('role', 'alert')
    bande.appendChild(bandeau)
  }

  // Un vrai <form> : la touche Entrée envoie, et le navigateur annonce
  // correctement l'ensemble aux lecteurs d'écran.
  const formulaire = creer('form')
  formulaire.noValidate = true

  // Changer le nombre de places change le total affiché sur le bouton :
  // on redessine. La saisie est dans l'état, elle ne se perd pas.
  const selecteur = selecteurPlaces(creneau, dessiner)
  if (selecteur) formulaire.appendChild(selecteur)

  for (const definition of champsDemandes()) {
    formulaire.appendChild(champ(definition))
  }

  const envoyerBouton = creer(
    'button',
    'bouton-principal bouton-envoi',
    `Confirmer · ${formaterPrix(creneau.price_cents * etat.places)}`,
  )
  envoyerBouton.type = 'submit'

  formulaire.appendChild(envoyerBouton)

  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault()
    soumettre(cours, creneau)
  })

  bande.appendChild(formulaire)
  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

function ecranEnvoi(cours: Course, creneau: Slot): HTMLElement {
  const zone = creer('div', 'tunnel')

  // Pas d'en-tête : il n'y a rien à faire pendant l'attente, et un bouton
  // « fermer » ici laisserait croire qu'on peut annuler l'envoi.
  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande attente')

  bande.appendChild(creer('div', 'rotateur'))
  bande.appendChild(creer('p', 'attente-titre', 'Nous confirmons votre place'))

  // Un rond qui tourne sans rien dire est perçu comme une panne. Dire ce qui
  // se passe ne raccourcit pas les 4 secondes, mais change leur perception.
  bande.appendChild(
    creer(
      'p',
      'attente-detail',
      'Nous enregistrons votre réservation et envoyons votre email de confirmation. Cela prend quelques secondes.',
    ),
  )

  bande.appendChild(
    creer('p', 'attente-recap', `${cours.name} · ${formaterJour(creneau.starts_at)}`),
  )

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

function ecranConfirme(creneau: Slot, code: string, total: number): HTMLElement {
  const zone = creer('div', 'tunnel')
  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande confirmation')

  const logo = logoAtelier()
  if (logo) {
    logo.className = 'logo logo-confirmation'
    bande.appendChild(logo)
  }

  bande.appendChild(creer('p', 'confirmation-pastille', '✓'))
  bande.appendChild(creer('p', 'confirmation-titre', 'Votre place est réservée'))

  bande.appendChild(
    creer(
      'p',
      'confirmation-detail',
      `Un email de confirmation vient de partir à ${etat.saisie.email}.`,
    ),
  )

  const boite = creer('div', 'recap')
  boite.appendChild(creer('p', 'recap-cours', 'Code de réservation'))
  boite.appendChild(creer('p', 'confirmation-code', code))
  boite.appendChild(
    creer(
      'p',
      'recap-quand',
      `${formaterJour(creneau.starts_at)} à ${formaterHeure(creneau.starts_at)}`,
    ),
  )
  boite.appendChild(creer('p', 'recap-prix', `${formaterPrix(total)} à régler sur place`))

  bande.appendChild(boite)

  const fermer = creer('button', 'bouton-principal', 'Terminer')

  fermer.addEventListener('click', () => {
    // La réservation est faite : on ne garde pas les coordonnées pour la
    // prochaine ouverture du widget.
    etat.saisie = { first_name: '', last_name: '', email: '', phone: '', notes: '' }
    etat.erreurs = {}
    etat.erreurEnvoi = null

    fermerTunnel()
  })
  bande.appendChild(fermer)

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

// L'écran du refus. C'est la réponse à la question 3 de l'énoncé.
function ecranPlacePartie(cours: Course, creneau: Slot, restantes: number): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(cours.name))

  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande refus')

  const quand = `${formaterJour(creneau.starts_at)} à ${formaterHeure(creneau.starts_at)}`

  // Deux situations très différentes derrière le même code 409.
  if (restantes > 0) {
    // Il reste des places, mais moins que demandé. Inutile de renvoyer la
    // personne ailleurs : la bonne proposition est de réduire.
    bande.appendChild(
      creer(
        'p',
        'refus-titre',
        restantes === 1
          ? 'Il ne reste qu’une place'
          : `Il ne reste que ${restantes} places`,
      ),
    )

    bande.appendChild(
      creer(
        'p',
        'refus-detail',
        `Vous en demandiez ${etat.places} pour le créneau du ${quand}. Les autres viennent d’être réservées. Vos coordonnées sont conservées.`,
      ),
    )

    const reduire = creer(
      'button',
      'bouton-principal',
      restantes === 1 ? 'Réserver pour 1 personne' : `Réserver pour ${restantes} personnes`,
    )

    reduire.addEventListener('click', () => {
      etat.places = restantes
      etat.ecran = { nom: 'coordonnees', cours, creneau }
      dessiner()
    })

    bande.appendChild(reduire)
  } else {
    bande.appendChild(creer('p', 'refus-titre', 'Cette place vient d’être réservée'))

    bande.appendChild(
      creer(
        'p',
        'refus-detail',
        `Le créneau du ${quand} est complet depuis quelques instants. Vos coordonnées sont conservées.`,
      ),
    )
  }

  const autres = etat.creneaux.filter(
    (autre) => autre.slot_id !== creneau.slot_id && autre.seats_available > 0,
  )

  if (autres.length > 0) {
    bande.appendChild(creer('p', 'refus-sous-titre', 'Prochaines dates disponibles'))

    const liste = creer('div', 'liste')

    // Les trois plus proches : au-delà, on renvoie vers la liste complète.
    for (const autre of autres.slice(0, 3)) {
      liste.appendChild(
        ligneCreneau(autre, (choisi) => {
          // La saisie n'est pas touchée : un clic suffit pour repartir.
          etat.places = Math.min(etat.places, placesMaximum(choisi))

          etat.ecran = { nom: 'coordonnees', cours, creneau: choisi }
          dessiner()
        }),
      )
    }

    bande.appendChild(liste)
  }

  const toutes = creer('button', 'bouton-secondaire', 'Voir toutes les dates')
  toutes.addEventListener('click', () => {
    etat.ecran = { nom: 'creneaux', cours }
    dessiner()
  })
  bande.appendChild(toutes)

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

// Même code HTTP que ci-dessus, cause différente : il n'y a plus de place à
// récupérer, le cours lui-même n'a plus lieu. Le message ne peut pas être le même.
function ecranCreneauAnnule(cours: Course): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(cours.name))

  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande refus')

  bande.appendChild(creer('p', 'refus-titre', 'Cette séance a été annulée'))
  bande.appendChild(
    creer(
      'p',
      'refus-detail',
      'L’atelier vient d’annuler ce créneau. Aucune réservation n’a été enregistrée et rien ne vous sera facturé.',
    ),
  )

  const toutes = creer('button', 'bouton-principal', 'Choisir une autre date')
  toutes.addEventListener('click', () => {
    etat.ecran = { nom: 'creneaux', cours }
    dessiner()
  })
  bande.appendChild(toutes)

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

// --- Le rendu ----------------------------------------------------------------

function dessiner(): void {
  vider(racine)

  if (etat.ecran.nom === 'bouton') {
    racine.appendChild(ecranBouton())
    return
  }

  if (etat.ecran.nom === 'cours') {
    racine.appendChild(ecranCours())
    return
  }

  if (etat.ecran.nom === 'creneaux') {
    racine.appendChild(ecranCreneaux(etat.ecran.cours))
    return
  }

  if (etat.ecran.nom === 'coordonnees') {
    racine.appendChild(ecranCoordonnees(etat.ecran.cours, etat.ecran.creneau))
    return
  }

  if (etat.ecran.nom === 'envoi') {
    racine.appendChild(ecranEnvoi(etat.ecran.cours, etat.ecran.creneau))
    return
  }

  if (etat.ecran.nom === 'confirme') {
    racine.appendChild(ecranConfirme(etat.ecran.creneau, etat.ecran.code, etat.ecran.total))
    return
  }

  if (etat.ecran.nom === 'place-partie') {
    racine.appendChild(
      ecranPlacePartie(etat.ecran.cours, etat.ecran.creneau, etat.ecran.restantes),
    )
    return
  }

  racine.appendChild(ecranCreneauAnnule(etat.ecran.cours))
}

// --- Validation --------------------------------------------------------------

// Volontairement permissive : on vérifie qu'il y a un @ entouré de texte et un
// point après. Les expressions très strictes rejettent de vraies adresses, et
// le seul test qui fait foi est l'email de confirmation qui arrive ou non.
function emailPlausible(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)
}

function valider(): Partial<Record<keyof Saisie, string>> {
  const erreurs: Partial<Record<keyof Saisie, string>> = {}

  for (const definition of champsDemandes()) {
    const valeur = etat.saisie[definition.cle].trim()

    if (definition.obligatoire && !valeur) {
      erreurs[definition.cle] = definition.siManquant ?? `${definition.libelle} est nécessaire.`
      continue
    }

    if (definition.cle === 'email' && valeur && !emailPlausible(valeur)) {
      erreurs.email = 'Cette adresse ne semble pas valide.'
    }
  }

  return erreurs
}

async function soumettre(cours: Course, creneau: Slot): Promise<void> {
  // Le verrou. Le bouton disparaît avec l'écran, mais la touche Entrée ou un
  // double-clic rapide peuvent déclencher deux appels avant le redessin.
  if (etat.envoiEnCours) return

  etat.erreurEnvoi = null
  etat.erreurs = valider()

  if (Object.keys(etat.erreurs).length > 0) {
    dessiner()

    // Le redessin a détruit l'élément qui avait le focus. On le redonne au
    // premier champ en erreur, sinon l'utilisateur ne sait pas où regarder.
    racine.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }

  etat.envoiEnCours = true
  etat.ecran = { nom: 'envoi', cours, creneau }
  dessiner()

  const resultat = await postBooking({
    slot_id: creneau.slot_id,

    seats: etat.places,

    customer: {
      first_name: etat.saisie.first_name.trim(),
      last_name: etat.saisie.last_name.trim(),
      email: etat.saisie.email.trim(),
      phone: etat.saisie.phone.trim() || undefined,
    },

    notes: etat.saisie.notes.trim() || undefined,
  })

  etat.envoiEnCours = false

  if (resultat.ok) {
    etat.ecran = {
      nom: 'confirme',
      creneau,
      code: resultat.donnees.confirmation_code,
      total: resultat.donnees.total_cents,
    }

    dessiner()
    return
  }

  traiterEchec(cours, creneau, resultat.erreur)
}

function traiterEchec(cours: Course, creneau: Slot, erreur: ErreurApi): void {
  // --- La place est partie pendant la saisie ------------------------------
  if (erreur.code === 'slot_full') {
    // Les créneaux affichés datent d'avant : on les rafraîchit pour proposer
    // des dates qui existent encore. L'écran s'affiche sans attendre.
    etat.ecran = { nom: 'place-partie', cours, creneau, restantes: erreur.available ?? 0 }
    dessiner()

    rafraichirCreneaux(cours)
    return
  }

  if (erreur.code === 'slot_cancelled') {
    etat.ecran = { nom: 'creneau-annule', cours }
    dessiner()

    rafraichirCreneaux(cours)
    return
  }

  // --- On retourne au formulaire, saisie intacte --------------------------
  etat.ecran = { nom: 'coordonnees', cours, creneau }

  if (erreur.code === 'phone_required') {
    // /studio disait que le téléphone n'était pas demandé, le serveur dit
    // l'inverse : l'artisan a changé sa politique depuis le chargement.
    // On fait apparaître le champ plutôt que d'afficher une erreur opaque.
    etat.telephoneExige = true
    etat.erreurs = {
      phone: 'L’atelier demande désormais un numéro de téléphone pour réserver.',
    }

    dessiner()
    racine.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }

  if (erreur.code === 'too_many_seats') {
    const plafond = etat.studio?.booking_policy.max_seats_per_booking ?? 1

    // On ramène la demande dans les limites plutôt que de laisser la personne
    // deviner combien elle a le droit de réserver.
    etat.places = Math.min(etat.places, plafond)

    etat.erreurEnvoi = `Cet atelier accepte au maximum ${plafond} places par réservation. Votre demande a été ramenée à ${etat.places}.`

    dessiner()
    return
  }

  if (erreur.statut === 429) {
    etat.erreurEnvoi =
      'Trop de réservations ont été lancées depuis votre connexion. Patientez une minute, puis réessayez.'
    dessiner()
    return
  }

  // --- Le cas qu'on ne sait pas trancher ----------------------------------
  //
  // Pas de réponse du tout : la réservation a peut-être été créée malgré tout.
  // L'API n'a pas de clé d'idempotence, et pas d'endpoint pour vérifier.
  // On ne réessaie donc JAMAIS tout seul, et on le dit honnêtement.
  if (erreur.statut === null) {
    etat.erreurEnvoi =
      'Nous n’avons pas reçu de réponse. Votre réservation a peut-être été enregistrée : vérifiez votre boîte email avant de réessayer, un message de confirmation signifie que votre place est prise.'

    dessiner()
    return
  }

  etat.erreurEnvoi =
    'Le service est momentanément indisponible. Votre saisie est conservée, réessayez dans un instant.'

  dessiner()
}

// Recharge les créneaux sans changer d'écran : sert à proposer des dates
// encore valables après un refus.
async function rafraichirCreneaux(cours: Course): Promise<void> {
  const aujourdhui = new Date()
  const fin = new Date(aujourdhui)
  fin.setDate(fin.getDate() + FENETRE_JOURS)

  const resultat = await getSlots(cours.course_id, aujourdhui, fin)

  if (!resultat.ok) return

  const maintenant = Date.now()

  etat.creneaux = resultat.donnees.slots
    .filter((creneau) => new Date(creneau.starts_at).getTime() > maintenant)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  dessiner()
}

// --- Navigation --------------------------------------------------------------

function ouvrirTunnel(): void {
  envoyer('expand')

  etat.ecran = { nom: 'cours' }
  dessiner()

  // On ne charge les cours qu'ici, pas au démarrage. Le bouton est affiché à
  // tous les visiteurs du site de l'artisan ; la liste n'intéresse que ceux
  // qui cliquent. Sur un trafic à 60 % mobile, ça évite de télécharger
  // 40 cours pour rien.
  if (etat.cours.length === 0) chargerCours()
}

function fermerTunnel(): void {
  envoyer('collapse')

  // Hors iframe (widget ouvert seul pendant le développement), personne ne
  // nous renverra 'closed' : on revient au bouton nous-mêmes.
  if (!estDansUneIframe()) {
    etat.ecran = { nom: 'bouton' }
    dessiner()
  }
}

// --- Chargement des données --------------------------------------------------

async function chargerCours(): Promise<void> {
  etat.chargement = true
  etat.erreur = null
  dessiner()

  const resultat = await getCourses()

  etat.chargement = false

  if (!resultat.ok) {
    etat.erreur = texteDErreur(resultat.erreur.statut, resultat.erreur.code)
    dessiner()
    return
  }

  etat.cours = resultat.donnees.courses
  dessiner()
}

async function chargerCreneaux(cours: Course): Promise<void> {
  etat.chargement = true
  etat.erreur = null
  dessiner()

  const aujourdhui = new Date()
  const fin = new Date(aujourdhui)
  fin.setDate(fin.getDate() + FENETRE_JOURS)

  const resultat = await getSlots(cours.course_id, aujourdhui, fin)

  etat.chargement = false

  if (!resultat.ok) {
    etat.erreur = texteDErreur(resultat.erreur.statut, resultat.erreur.code)
    dessiner()
    return
  }

  // L'API peut renvoyer des créneaux déjà passés : on ne les propose pas.
  const maintenant = Date.now()

  etat.creneaux = resultat.donnees.slots
    .filter((creneau) => new Date(creneau.starts_at).getTime() > maintenant)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  dessiner()
}

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

// --- Couleurs : contraste et lisibilité ---------------------------------------

// Luminance relative d'une couleur, au sens du WCAG.
//
// Ce n'est pas une moyenne des trois canaux : l'œil humain est beaucoup plus
// sensible au vert qu'au bleu, d'où les coefficients. Et chaque canal est
// d'abord « linéarisé », parce que les valeurs d'un code hexadécimal ne sont
// pas proportionnelles à la lumière réellement émise.
function luminance(rouge: number, vert: number, bleu: number): number {
  const lineariser = (canal: number): number => {
    const v = canal / 255

    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }

  return 0.2126 * lineariser(rouge) + 0.7152 * lineariser(vert) + 0.0722 * lineariser(bleu)
}

// Rapport de contraste entre deux luminances, de 1 (identiques) à 21
// (noir sur blanc). Le WCAG demande au moins 4,5 pour du texte courant.
function contraste(a: number, b: number): number {
  const clair = Math.max(a, b)
  const sombre = Math.min(a, b)

  return (clair + 0.05) / (sombre + 0.05)
}

// Noir ou blanc, selon lequel se lit le mieux sur la couleur donnée.
//
// C'est NOUS qui décidons de cette couleur, pas l'artisan. Il choisit son
// accent ; s'il prend un rose pâle, le texte blanc deviendrait illisible et
// c'est lui qui perdrait la vente, sans comprendre pourquoi. Il peut influencer
// l'apparence, jamais la lisibilité.
const TEXTE_CLAIR = '#ffffff'
const TEXTE_SOMBRE = '#111111'

function texteLisibleSur(rouge: number, vert: number, bleu: number): string {
  const fond = luminance(rouge, vert, bleu)

  // On compare avec les couleurs qu'on va réellement poser, pas avec du noir
  // et du blanc idéalisés : #111111 n'a pas tout à fait le contraste du noir pur.
  const avecClair = contraste(fond, luminance(255, 255, 255))
  const avecSombre = contraste(fond, luminance(17, 17, 17))

  return avecClair >= avecSombre ? TEXTE_CLAIR : TEXTE_SOMBRE
}

// --- Démarrage ---------------------------------------------------------------

function appliquerCouleur(studio: Studio): void {
  const couleur = studio.branding.primary_color

  // Cette valeur vient du back-office de l'artisan : on ne fait confiance
  // qu'à un code hexadécimal.
  if (!/^#[0-9a-f]{6}$/i.test(couleur)) return

  const rouge = parseInt(couleur.slice(1, 3), 16)
  const vert = parseInt(couleur.slice(3, 5), 16)
  const bleu = parseInt(couleur.slice(5, 7), 16)

  document.documentElement.style.setProperty('--accent', couleur)
  document.documentElement.style.setProperty('--accent-texte', texteLisibleSur(rouge, vert, bleu))
}

async function demarrer(): Promise<void> {
  const resultat = await getStudio()

  // Si l'API ne répond pas, le widget n'affiche RIEN et ne signale pas 'ready'.
  // Sinon l'utilisateur verrait deux boutons : le nôtre, qui ouvrirait un
  // tunnel vide, et le lien de secours du loader. Mieux vaut laisser la place
  // au seul chemin qui fonctionne encore.
  if (!resultat.ok) return

  etat.studio = resultat.donnees
  appliquerCouleur(resultat.donnees)

  dessiner()

  // La page hôte peut nous refermer sans nous le demander.
  ecouter((type) => {
    if (type === 'closed') {
      etat.ecran = { nom: 'bouton' }
      dessiner()
    }
  })

  // Échap tapé DANS l'iframe n'atteint jamais le document hôte : le <dialog>
  // ne le voit pas et ne se referme pas tout seul. C'est le prix de
  // l'isolation, et il se paie ici.
  window.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Escape') return
    if (etat.ecran.nom === 'bouton') return

    // Pendant l'envoi, fermer ne servirait à rien : la requête est partie et
    // la réservation sera créée. Mieux vaut laisser l'attente se terminer.
    if (etat.ecran.nom === 'envoi') return

    fermerTunnel()
  })

  // C'est ce message qui empêche le lien de secours d'apparaître.
  envoyer('ready')
}

demarrer()
