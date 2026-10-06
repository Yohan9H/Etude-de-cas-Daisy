// Données du faux serveur Daisy.
//
// Volontairement sales, comme le décrit daisy-api.md :
//   - 40 cours
//   - des descriptions vides et des descriptions de 800 caractères
//   - des cours sans image
//   - un nom de cours interminable
//   - des prix qui changent d'un créneau à l'autre
//   - des créneaux complets, et des créneaux à 1 place
//
// Tout est en mémoire : les places diminuent réellement quand on réserve,
// et tout repart à zéro au redémarrage du serveur.

export const studio = {
  studio_id: 'std_2201',
  name: 'Atelier Terre & Feu',
  timezone: 'Europe/Paris',
  currency: 'EUR',

  branding: {
    primary_color: '#C4643A',

    // La spec pointe vers cdn.daisy.example, qui n'existe pas. On sert un vrai
    // logo depuis le faux serveur pour que l'affichage soit vérifiable.
    // Le cas de l'image qui ne charge pas reste couvert : les 40 cours ont
    // tous une image_url qui ne répond jamais.
    logo_url: 'http://localhost:3001/logo.svg',
  },

  booking_policy: {
    requires_phone: true,
    cancellation_hours: 48,
    max_seats_per_booking: 4,
  },
}

const DESCRIPTION_LONGUE =
  "Cet atelier commence par une présentation des différentes terres et de leurs comportements au séchage, " +
  "puis se poursuit par une démonstration complète du centrage sur le tour. Vous apprendrez à préparer votre " +
  "motte, à la fixer correctement, à monter les parois sans les déchirer et à rattraper les erreurs les plus " +
  "courantes. La deuxième partie de la séance est consacrée à la pratique libre, accompagnée pas à pas. " +
  "Chaque participant réalise deux à trois pièces, dont une sera cuite et émaillée par l'atelier puis " +
  "récupérable trois semaines plus tard. Le matériel, les tabliers et les outils sont fournis. Prévoyez des " +
  "vêtements qui ne craignent rien et des ongles courts. L'atelier est accessible aux débutants complets, " +
  "aucune expérience préalable n'est demandée, et le groupe ne dépasse jamais huit personnes pour que chacun " +
  "puisse être suivi individuellement du début à la fin de la séance."

// Les cours écrits à la main : ce sont eux qui portent les cas pénibles.
const COURS_A_LA_MAIN = [
  {
    nom: 'Tour de potier — débutant',
    description: "Deux heures d'initiation au tournage. Tout le matériel est fourni, prévoyez des vêtements qui ne craignent rien.",
    niveau: 'debutant',
    prix: 7500,
    duree: 120,
    avecImage: true,

    // Samedi ET mercredi : les deux tarifs apparaissent dans la même liste,
    // ce qui rend visible le fait que le prix dépend du créneau.
    jour: [6, 3],
    heure: 14,
  },
  {
    nom: 'Atelier découverte du tournage et de l\'émaillage pour les enfants de 6 à 12 ans accompagnés d\'un adulte responsable',
    description: DESCRIPTION_LONGUE,
    niveau: 'debutant',
    prix: 9000,
    duree: 180,
    avecImage: false,
    jour: 3, // mercredi
    heure: 10,
  },
  {
    nom: 'Émaillage',
    description: '',
    niveau: 'intermediaire',
    prix: 5500,
    duree: 90,
    avecImage: false,
    jour: 2,
    heure: 18,
  },
  {
    nom: 'Modelage à la plaque',
    description: 'Une technique sans tour, accessible dès la première séance.',
    niveau: 'debutant',
    prix: 6000,
    duree: 120,
    avecImage: true,
    jour: 4,
    heure: 19,
  },
  {
    nom: 'Tour de potier — perfectionnement',
    description: DESCRIPTION_LONGUE,
    niveau: 'avance',
    prix: 9500,
    duree: 180,
    avecImage: true,
    jour: 6,
    heure: 10,
  },
]

const NIVEAUX = ['debutant', 'intermediaire', 'avance']

// Suite déterministe plutôt que Math.random() :
// la démo donne toujours les mêmes places, donc elle est reproductible devant un jury.
function pseudoAleatoire(graine) {
  const x = Math.sin(graine * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function deuxChiffres(n) {
  return String(n).padStart(2, '0')
}

// Décalage horaire de Paris pour un instant donné, en minutes (+60 en hiver, +120 en été).
function decalageParisEnMinutes(instant) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'longOffset',
  })

  const nom = format.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? ''
  const trouve = nom.match(/GMT([+-])(\d{2}):(\d{2})/)

  if (!trouve) return 0

  const signe = trouve[1] === '-' ? -1 : 1
  return signe * (Number(trouve[2]) * 60 + Number(trouve[3]))
}

// Construit une date au format de la spec : heure locale de l'atelier + son décalage.
// Exemple : 2026-10-17T14:00:00+02:00
function dateAuFormatSpec(annee, mois, jour, heure) {
  // Midi UTC : on est loin des heures de bascule, donc le décalage du jour est fiable.
  const midi = new Date(Date.UTC(annee, mois - 1, jour, 12))
  const decalage = decalageParisEnMinutes(midi)

  const signe = decalage >= 0 ? '+' : '-'
  const absolu = Math.abs(decalage)

  const dec = `${signe}${deuxChiffres(Math.floor(absolu / 60))}:${deuxChiffres(absolu % 60)}`

  return `${annee}-${deuxChiffres(mois)}-${deuxChiffres(jour)}T${deuxChiffres(heure)}:00:00${dec}`
}

// Les `nombre` prochaines occurrences des jours demandés, à partir de demain.
// Plusieurs jours sont possibles : c'est ce qui fait qu'un même cours peut
// avoir des créneaux en semaine ET le week-end, donc à deux tarifs différents.
function prochainesDates(joursDeLaSemaine, nombre) {
  const jours = Array.isArray(joursDeLaSemaine) ? joursDeLaSemaine : [joursDeLaSemaine]
  const dates = []
  const curseur = new Date()

  curseur.setHours(0, 0, 0, 0)

  while (dates.length < nombre) {
    curseur.setDate(curseur.getDate() + 1)

    if (!jours.includes(curseur.getDay())) continue

    dates.push({
      annee: curseur.getFullYear(),
      mois: curseur.getMonth() + 1,
      jour: curseur.getDate(),
      weekend: curseur.getDay() === 0 || curseur.getDay() === 6,
    })
  }

  return dates
}

// --- Construction du catalogue -------------------------------------------------

export const courses = []
const creneauxParCours = new Map()
const creneauxParId = new Map()

let prochainIdCreneau = 44_710

function ajouterCours(index, modele) {
  const courseId = `crs_${100 + index}`

  courses.push({
    course_id: courseId,
    name: modele.nom,
    description: modele.description,
    duration_minutes: modele.duree,
    price_cents: modele.prix,
    image_url: modele.avecImage ? `https://cdn.daisy.example/courses/${courseId}.jpg` : null,
    level: modele.niveau,
  })

  const creneaux = prochainesDates(modele.jour, 8).map((date, i) => {
    const alea = pseudoAleatoire(index * 31 + i)

    const total = 8

    // Un créneau sur huit est complet, un autre n'a qu'une place.
    // Ces deux cas sont ceux qu'on veut pouvoir montrer.
    let disponibles
    if (i === 1) disponibles = 0
    else if (i === 2) disponibles = 1
    else disponibles = 2 + Math.floor(alea * (total - 1))

    const creneau = {
      slot_id: `slt_${prochainIdCreneau++}`,
      course_id: courseId,
      starts_at: dateAuFormatSpec(date.annee, date.mois, date.jour, modele.heure),
      seats_total: total,
      seats_available: disponibles,

      // Tarif week-end : +10 € par rapport au prix du cours.
      price_cents: date.weekend ? modele.prix + 1000 : modele.prix,
    }

    creneauxParId.set(creneau.slot_id, creneau)
    return creneau
  })

  creneauxParCours.set(courseId, creneaux)
}

COURS_A_LA_MAIN.forEach((modele, i) => ajouterCours(i, modele))

// On complète jusqu'à 40 cours pour que le problème de la liste trop longue soit visible.
const THEMES = ['Raku', 'Grès', 'Porcelaine', 'Faïence', 'Engobe', 'Kurinuki', 'Colombin', 'Estampage']
const FORMATS = ['découverte', 'en duo', 'intensif', 'du soir', 'du dimanche']

for (let i = COURS_A_LA_MAIN.length; i < 40; i++) {
  const alea = pseudoAleatoire(i)

  ajouterCours(i, {
    nom: `${THEMES[i % THEMES.length]} — ${FORMATS[i % FORMATS.length]}`,
    description: i % 5 === 0 ? '' : 'Séance en petit groupe, matériel fourni.',
    niveau: NIVEAUX[i % NIVEAUX.length],
    prix: 4500 + Math.floor(alea * 10) * 500,
    duree: [90, 120, 180][i % 3],
    avecImage: i % 3 !== 0,
    jour: (i % 6) + 1,
    heure: [10, 14, 18, 19][i % 4],
  })
}

// --- Lecture et écriture -------------------------------------------------------

export function creneauxDuCours(courseId) {
  return creneauxParCours.get(courseId) ?? null
}

export function creneauParId(slotId) {
  return creneauxParId.get(slotId) ?? null
}

// Réserve des places, ou explique pourquoi ce n'est pas possible.
// C'est ici que le 409 « naturel » se produit, sans avoir besoin d'un scénario forcé.
export function reserverPlaces(slotId, places) {
  const creneau = creneauParId(slotId)

  if (!creneau) {
    return { ok: false, raison: 'introuvable' }
  }

  if (creneau.seats_available < places) {
    return { ok: false, raison: 'complet', available: creneau.seats_available }
  }

  creneau.seats_available -= places

  return { ok: true, total_cents: creneau.price_cents * places }
}
