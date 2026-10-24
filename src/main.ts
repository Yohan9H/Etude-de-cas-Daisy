// Point d'entrée du widget.
//
// Deux règles de discipline, tenues partout :
//   - un seul objet d'état, une seule fonction qui dessine. Aucune
//     modification du DOM ailleurs que dans les fonctions d'écran ;
//   - jamais innerHTML avec une donnée de l'API. Un nom de cours peut
//     contenir du HTML. On passe par createElement et textContent.

import './style.css'

import { getStudio, getCourses, getSlots, postBooking } from './api'
import type { Studio, Course, Slot } from './api'
import { envoyer, ecouter, estDansUneIframe } from './pont'
import { creerTunnel, FENETRE_JOURS } from './tunnel'
import type { EchecEnvoi, EtatTunnel, Saisie, Tunnel } from './tunnel'
import { hoteAutonome, hoteIframe } from './hote'

// --- L'état ------------------------------------------------------------------

// Le tunnel décide s'il est ouvert et porte tous les écrans, de la liste des
// cours à la confirmation, refus compris.
let tunnel: Tunnel

type Etat = {
  studio: Studio | null
}

const etat: Etat = {
  studio: null,
}

const racine = document.getElementById('app')!

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
  fermer.addEventListener('click', () => tunnel.fermer())
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

  carte.addEventListener('click', () => tunnel.choisirCours(cours))

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

  type?: string
  autocomplete?: string
  inputmode?: string
  multiligne?: boolean
  aide?: string
}

// Les champs demandés dépendent de la politique de l'atelier : le téléphone
// n'apparaît que si le tunnel le demande. Un champ en moins à l'étape où on
// perd 60 % des gens, c'est la modification la plus rentable du tunnel.
function champsDemandes(): DefinitionChamp[] {
  const champs: DefinitionChamp[] = [
    {
      cle: 'first_name',
      libelle: 'Prénom',
      autocomplete: 'given-name',
    },
    {
      cle: 'last_name',
      libelle: 'Nom',
      autocomplete: 'family-name',
    },
    {
      cle: 'email',
      libelle: 'Email',
      type: 'email',
      autocomplete: 'email',
      inputmode: 'email',
      aide: 'Votre confirmation y sera envoyée.',
    },
  ]

  if (tunnel.etat.telephoneDemande) {
    champs.push({
      cle: 'phone',
      libelle: 'Téléphone',
      type: 'tel',
      autocomplete: 'tel',
      inputmode: 'tel',
      aide: 'En cas de changement de dernière minute.',
    })
  }

  champs.push({
    cle: 'notes',
    libelle: 'Précisions (facultatif)',
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
  saisie.value = tunnel.etat.saisie[definition.cle]

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

  const erreur = tunnel.etat.erreurs[definition.cle]

  if (erreur) {
    saisie.setAttribute('aria-invalid', 'true')
    saisie.setAttribute('aria-describedby', idErreur)
  }

  // Le tunnel note chaque frappe ; `surChangement` ne redessine pas pour si
  // peu (voir plus bas).
  saisie.addEventListener('input', () => tunnel.saisir(definition.cle, saisie.value))

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

// `maximum` est la borne calculée par le tunnel pour ce créneau.
function selecteurPlaces(creneau: Slot, maximum: number): HTMLElement | null {
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
    choix.selected = n === tunnel.etat.places
    liste.appendChild(choix)
  }

  // Le tunnel borne la valeur, même absurde. Changer le nombre de places
  // change le total affiché : le redessin suit.
  liste.addEventListener('change', () => tunnel.changerPlaces(Number(liste.value)))

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
  const places = tunnel.etat.places
  const total = creneau.price_cents * places

  boite.appendChild(creer('p', 'recap-prix', formaterPrix(total)))

  // Le détail n'apparaît que s'il apporte quelque chose.
  if (places > 1) {
    boite.appendChild(
      creer(
        'p',
        'recap-detail-prix',
        `${places} × ${formaterPrix(creneau.price_cents)}`,
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

  bouton.addEventListener('click', () => tunnel.ouvrir())
  zone.appendChild(bouton)

  return zone
}

function ecranCours(): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(etat.studio?.name ?? 'Réserver'))

  const corps = creer('div', 'tunnel-corps')
  const cours = tunnel.etat.cours

  if (cours === null || cours.etat === 'en-chargement') {
    corps.appendChild(messageCentral('Chargement…', 'Nous récupérons les ateliers proposés.'))
    zone.appendChild(corps)
    return zone
  }

  if (cours.etat === 'en-erreur') {
    corps.appendChild(
      messageCentral('Impossible d’afficher les ateliers', cours.message, () => tunnel.reessayer()),
    )
    zone.appendChild(corps)
    return zone
  }

  if (cours.liste.length === 0) {
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

  for (const unCours of cours.liste) {
    liste.appendChild(carteCours(unCours))
  }

  corps.appendChild(liste)
  zone.appendChild(corps)

  return zone
}

function ecranCreneaux(cours: Course): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(cours.name, () => tunnel.revenir()))

  const corps = creer('div', 'tunnel-corps')
  const creneaux = tunnel.etat.creneaux

  if (creneaux === null || creneaux.etat === 'en-chargement') {
    corps.appendChild(messageCentral('Chargement…', 'Nous récupérons les prochaines dates.'))
    zone.appendChild(corps)
    return zone
  }

  if (creneaux.etat === 'en-erreur') {
    corps.appendChild(
      messageCentral('Impossible d’afficher les dates', creneaux.message, () => tunnel.reessayer()),
    )
    zone.appendChild(corps)
    return zone
  }

  if (creneaux.liste.length === 0) {
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

  for (const creneau of creneaux.liste) {
    liste.appendChild(ligneCreneau(creneau, (choisi) => tunnel.choisirCreneau(choisi)))
  }

  corps.appendChild(liste)
  zone.appendChild(corps)

  return zone
}

function ecranCoordonnees(
  cours: Course,
  creneau: Slot,
  placesMaximum: number,
  echec: EchecEnvoi | undefined,
): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel('Vos coordonnées', () => tunnel.revenir()))

  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande formulaire')

  bande.appendChild(recapitulatif(cours, creneau))

  // Erreur qui ne porte sur aucun champ : réseau, 429, 500. Elle est annoncée
  // aux lecteurs d'écran et placée avant le formulaire, pas après le bouton.
  if (echec) {
    const bandeau = creer('p', 'bandeau-erreur', texteDEchec(echec))
    bandeau.setAttribute('role', 'alert')
    bande.appendChild(bandeau)
  }

  // Un vrai <form> : la touche Entrée envoie, et le navigateur annonce
  // correctement l'ensemble aux lecteurs d'écran.
  const formulaire = creer('form')
  formulaire.noValidate = true

  const selecteur = selecteurPlaces(creneau, placesMaximum)
  if (selecteur) formulaire.appendChild(selecteur)

  for (const definition of champsDemandes()) {
    formulaire.appendChild(champ(definition))
  }

  const envoyerBouton = creer(
    'button',
    'bouton-principal bouton-envoi',
    `Confirmer · ${formaterPrix(creneau.price_cents * tunnel.etat.places)}`,
  )
  envoyerBouton.type = 'submit'

  formulaire.appendChild(envoyerBouton)

  formulaire.addEventListener('submit', (evenement) => {
    evenement.preventDefault()
    tunnel.envoyer()
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

function ecranConfirmation(creneau: Slot, code: string, total: number, email: string): HTMLElement {
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
      `Un email de confirmation vient de partir à ${email}.`,
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

  // Le tunnel efface la saisie : la réservation est faite.
  fermer.addEventListener('click', () => tunnel.terminer())
  bande.appendChild(fermer)

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

// L'écran du refus. C'est la réponse à la question 3 de l'énoncé.
function ecranPlacePartie(cours: Course, creneau: Slot, alternatives: Slot[]): HTMLElement {
  const zone = creer('div', 'tunnel')

  zone.appendChild(enteteTunnel(cours.name))

  const corps = creer('div', 'tunnel-corps')
  const bande = creer('div', 'bande refus')

  const quand = `${formaterJour(creneau.starts_at)} à ${formaterHeure(creneau.starts_at)}`
  const restantes = creneau.seats_available

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
        `Vous en demandiez ${tunnel.etat.places} pour le créneau du ${quand}. Les autres viennent d’être réservées. Vos coordonnées sont conservées.`,
      ),
    )

    const reduire = creer(
      'button',
      'bouton-principal',
      restantes === 1 ? 'Réserver pour 1 personne' : `Réserver pour ${restantes} personnes`,
    )

    // Le tunnel ramène la demande aux places restantes du créneau.
    reduire.addEventListener('click', () => tunnel.choisirCreneau(creneau))

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

  if (alternatives.length > 0) {
    bande.appendChild(creer('p', 'refus-sous-titre', 'Prochaines dates disponibles'))

    const liste = creer('div', 'liste')

    for (const autre of alternatives) {
      // La saisie n'est pas touchée : un clic suffit pour repartir.
      liste.appendChild(ligneCreneau(autre, (choisi) => tunnel.choisirCreneau(choisi)))
    }

    bande.appendChild(liste)
  }

  const toutes = creer('button', 'bouton-secondaire', 'Voir toutes les dates')
  toutes.addEventListener('click', () => tunnel.voirToutesLesDates())
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
  toutes.addEventListener('click', () => tunnel.voirToutesLesDates())
  bande.appendChild(toutes)

  corps.appendChild(bande)
  zone.appendChild(corps)

  return zone
}

// --- Le rendu ----------------------------------------------------------------

// Le dernier état du tunnel dessiné, pour `surChangement`.
let etatDessine: EtatTunnel | null = null

function dessiner(): void {
  etatDessine = tunnel.etat
  vider(racine)

  const ecran = tunnel.etat.ecran

  if (ecran.nom === 'bouton') {
    racine.appendChild(ecranBouton())
    return
  }

  if (ecran.nom === 'creneaux') {
    racine.appendChild(ecranCreneaux(ecran.cours))
    return
  }

  if (ecran.nom === 'coordonnees') {
    racine.appendChild(ecranCoordonnees(ecran.cours, ecran.creneau, ecran.placesMaximum, ecran.echec))
    return
  }

  if (ecran.nom === 'envoi') {
    racine.appendChild(ecranEnvoi(ecran.cours, ecran.creneau))
    return
  }

  if (ecran.nom === 'confirmation') {
    racine.appendChild(ecranConfirmation(ecran.creneau, ecran.code, ecran.total, ecran.email))
    return
  }

  if (ecran.nom === 'place-partie') {
    racine.appendChild(ecranPlacePartie(ecran.cours, ecran.creneau, ecran.alternatives))
    return
  }

  if (ecran.nom === 'creneau-annule') {
    racine.appendChild(ecranCreneauAnnule(ecran.cours))
    return
  }

  racine.appendChild(ecranCours())
}

// Une frappe ne change que la saisie : on NE redessine PAS, reconstruire le
// DOM ferait perdre le curseur à chaque lettre. Le champ affiche déjà ce qui
// vient d'être tapé.
function surChangement(): void {
  const avant = etatDessine
  const apres = tunnel.etat

  if (avant !== null && seuleLaSaisieAChange(avant, apres)) {
    etatDessine = apres
    return
  }

  dessiner()

  // Le redessin a détruit l'élément qui avait le focus. Quand des erreurs
  // apparaissent, on le donne au premier champ en erreur, sinon la personne
  // ne sait pas où regarder.
  if (apres.erreurs !== avant?.erreurs && Object.keys(apres.erreurs).length > 0) {
    racine.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }
}

function seuleLaSaisieAChange(avant: EtatTunnel, apres: EtatTunnel): boolean {
  const cles = Object.keys(apres) as (keyof EtatTunnel)[]

  return avant.saisie !== apres.saisie && cles.every((cle) => cle === 'saisie' || avant[cle] === apres[cle])
}

// --- Échecs d'envoi -----------------------------------------------------------

// Un switch sans défaut : un nouveau type d'échec sans texte ne compile pas,
// au lieu de s'afficher en « service indisponible ».
function texteDEchec(echec: EchecEnvoi): string {
  switch (echec.type) {
    case 'trop-de-places':
      return `Cet atelier accepte au maximum ${echec.plafond} places par réservation. Votre demande a été ramenée à ${echec.places}.`

    case 'trop-de-requetes':
      return 'Trop de réservations ont été lancées depuis votre connexion. Patientez une minute, puis réessayez.'

    case 'sans-reponse':
      return 'Nous n’avons pas reçu de réponse. Votre réservation a peut-être été enregistrée : vérifiez votre boîte email avant de réessayer, un message de confirmation signifie que votre place est prise.'

    case 'indisponible':
      return 'Le service est momentanément indisponible. Votre saisie est conservée, réessayez dans un instant.'
  }
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

  const hote = estDansUneIframe() ? hoteIframe() : hoteAutonome(() => tunnel.hoteAFerme())

  tunnel = creerTunnel({
    atelier: resultat.donnees,
    api: { getCourses, getSlots, postBooking },
    hote,
    horloge: () => new Date(),
  })

  tunnel.abonner(surChangement)
  dessiner()

  // La page hôte peut nous refermer sans nous le demander.
  ecouter((type) => {
    if (type === 'closed') tunnel.hoteAFerme()
  })

  // Widget seul, aucune page hôte ne peut nous refermer d'elle-même. Cet
  // évènement la simule, pour vérifier par script ce qui suit une fermeture
  // par la page hôte (voir `docs/agents/verification-demo.md`). Dans une
  // iframe, c'est l'écho `closed` qui joue ce rôle.
  if (!estDansUneIframe()) {
    window.addEventListener('daisy:hote-ferme', () => tunnel.hoteAFerme())
  }

  // Échap tapé DANS l'iframe n'atteint jamais le document hôte : le <dialog>
  // ne le voit pas et ne se referme pas tout seul. C'est le prix de
  // l'isolation, et il se paie ici.
  window.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Escape') return

    tunnel.fermer()
  })

  // C'est ce message qui empêche le lien de secours d'apparaître.
  envoyer('ready')
}

demarrer()
