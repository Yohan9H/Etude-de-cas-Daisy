import { describe, expect, it } from 'vitest'

import type { Booking, Course, Resultat, Slot, Studio } from './api'
import { creerTunnel } from './tunnel'
import type { ApiTunnel, Hote } from './tunnel'

// --- Les doublures -----------------------------------------------------------

const ATELIER: Studio = {
  studio_id: 'atelier-test',
  name: 'Atelier de test',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  branding: { primary_color: '#336699', logo_url: null },
  booking_policy: { requires_phone: false, cancellation_hours: 48, max_seats_per_booking: 4 },
}

const TOUR: Course = {
  course_id: 'tour',
  name: 'Initiation au tour',
  description: '',
  duration_minutes: 120,
  price_cents: 6500,
  image_url: null,
  level: 'debutant',
}

const MODELAGE: Course = { ...TOUR, course_id: 'modelage', name: 'Modelage' }

function creneau(id: string, debut: string): Slot {
  return { slot_id: id, starts_at: debut, seats_total: 8, seats_available: 8, price_cents: 6500 }
}

// Une promesse que le test résout quand il veut : c'est lui qui décide de
// l'ordre et du moment des réponses, ou qu'une réponse n'arrive jamais.
function reponseEnAttente<T>() {
  let resoudre!: (resultat: Resultat<T>) => void
  const promesse = new Promise<Resultat<T>>((r) => (resoudre = r))

  return { promesse, resoudre }
}

function fausseApi() {
  const appelsCours: ReturnType<typeof reponseEnAttente<{ courses: Course[] }>>[] = []
  const appelsCreneaux: (ReturnType<typeof reponseEnAttente<{ slots: Slot[] }>> & {
    idCours: string
    depuis: Date
    jusqua: Date
  })[] = []
  const appelsReservation: (ReturnType<typeof reponseEnAttente<Booking>> & {
    corps: Parameters<ApiTunnel['postBooking']>[0]
  })[] = []

  const api: ApiTunnel = {
    getCourses() {
      const reponse = reponseEnAttente<{ courses: Course[] }>()
      appelsCours.push(reponse)
      return reponse.promesse
    },

    getSlots(idCours, depuis, jusqua) {
      const reponse = reponseEnAttente<{ slots: Slot[] }>()
      appelsCreneaux.push({ ...reponse, idCours, depuis, jusqua })
      return reponse.promesse
    },

    postBooking(corps) {
      const reponse = reponseEnAttente<Booking>()
      appelsReservation.push({ ...reponse, corps })
      return reponse.promesse
    },
  }

  return { api, appelsCours, appelsCreneaux, appelsReservation }
}

function fauxHote() {
  const demandes: ('ouverture' | 'fermeture')[] = []

  const hote: Hote = {
    demanderOuverture: () => demandes.push('ouverture'),
    demanderFermeture: () => demandes.push('fermeture'),
  }

  return { hote, demandes }
}

const horlogeFixe = () => new Date('2026-10-22T10:00:00Z')

function nouveauTunnel(atelier: Studio = ATELIER) {
  const { api, appelsCours, appelsCreneaux, appelsReservation } = fausseApi()
  const { hote, demandes } = fauxHote()
  const tunnel = creerTunnel({ atelier, api, hote, horloge: horlogeFixe })

  return { tunnel, appelsCours, appelsCreneaux, appelsReservation, demandes }
}

// Laisse les promesses déjà résolues produire leurs effets.
const laisserFiler = () => new Promise((r) => setTimeout(r, 0))

// Un tunnel ouvert sur la liste des cours, prête.
async function tunnelSurLesCours() {
  const outils = nouveauTunnel()
  outils.tunnel.ouvrir()
  outils.appelsCours[0].resoudre({ ok: true, donnees: { courses: [TOUR, MODELAGE] } })
  await laisserFiler()

  return outils
}

// Un tunnel sur les créneaux du tour, prêts.
async function tunnelSurLesCreneaux(creneaux: Slot[]) {
  const outils = await tunnelSurLesCours()
  outils.tunnel.choisirCours(TOUR)
  outils.appelsCreneaux[0].resoudre({ ok: true, donnees: { slots: creneaux } })
  await laisserFiler()

  return outils
}

const PROCHE = creneau('proche', '2026-10-24T14:00:00Z')

// Un tunnel sur les coordonnées du créneau proche, saisie vide.
async function tunnelSurLesCoordonnees() {
  const outils = await tunnelSurLesCreneaux([PROCHE])
  outils.tunnel.choisirCreneau(PROCHE)

  return outils
}

// Un tunnel sur l'écran de confirmation, réservation faite par Camille.
async function tunnelSurLaConfirmation() {
  const outils = await tunnelSurLesCoordonnees()
  saisirCamille(outils.tunnel)
  outils.tunnel.envoyer()
  outils.appelsReservation[0].resoudre({
    ok: true,
    donnees: { booking_id: 'b1', status: 'confirmed', confirmation_code: 'DSY-4821', total_cents: 6500 },
  })
  await laisserFiler()

  return outils
}

const SAISIE_VIDE = { first_name: '', last_name: '', email: '', phone: '', notes: '' }

function saisirCamille(tunnel: ReturnType<typeof nouveauTunnel>['tunnel']) {
  tunnel.saisir('first_name', 'Camille')
  tunnel.saisir('last_name', 'Martin')
  tunnel.saisir('email', 'camille@exemple.fr')
}

// --- Les comportements -------------------------------------------------------

describe('ouvrir le tunnel', () => {
  it('demande l’ouverture à l’hôte et affiche la liste des cours en chargement', () => {
    const { tunnel, demandes } = nouveauTunnel()

    expect(tunnel.etat.ecran.nom).toBe('bouton')

    tunnel.ouvrir()

    expect(demandes).toEqual(['ouverture'])
    expect(tunnel.etat.ecran.nom).toBe('cours')
    expect(tunnel.etat.cours).toEqual({ etat: 'en-chargement' })
  })

  it('affiche les cours reçus et prévient l’abonné à chaque changement', async () => {
    const { tunnel, appelsCours } = nouveauTunnel()
    const vus: string[] = []
    tunnel.abonner(() => vus.push(tunnel.etat.cours?.etat ?? 'rien'))

    tunnel.ouvrir()
    appelsCours[0].resoudre({ ok: true, donnees: { courses: [TOUR] } })
    await laisserFiler()

    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR] })
    expect(vus).toEqual(['en-chargement', 'prete'])
  })

  it('ne charge la liste des cours qu’à la première ouverture', async () => {
    const { tunnel, appelsCours, demandes } = nouveauTunnel()

    tunnel.ouvrir()
    appelsCours[0].resoudre({ ok: true, donnees: { courses: [TOUR] } })
    await laisserFiler()
    tunnel.fermer()
    tunnel.hoteAFerme()
    tunnel.ouvrir()

    expect(appelsCours).toHaveLength(1)
    expect(demandes).toEqual(['ouverture', 'fermeture', 'ouverture'])
    expect(tunnel.etat.ecran.nom).toBe('cours')
    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR] })
  })
})

describe('fermer le tunnel', () => {
  it('demande la fermeture à l’hôte et attend sa confirmation pour revenir au bouton', () => {
    const { tunnel, demandes } = nouveauTunnel()
    tunnel.ouvrir()

    tunnel.fermer()

    expect(demandes).toEqual(['ouverture', 'fermeture'])
    expect(tunnel.etat.ecran.nom).toBe('cours')

    tunnel.hoteAFerme()

    expect(tunnel.etat.ecran.nom).toBe('bouton')
  })

  it('revient au bouton quand la page hôte referme le tunnel d’elle-même', () => {
    const { tunnel, demandes } = nouveauTunnel()
    tunnel.ouvrir()

    tunnel.hoteAFerme()

    expect(demandes).toEqual(['ouverture'])
    expect(tunnel.etat.ecran.nom).toBe('bouton')
  })

  it('ne demande rien à l’hôte quand le tunnel est déjà fermé', () => {
    const { tunnel, demandes } = nouveauTunnel()

    tunnel.fermer()

    expect(demandes).toEqual([])
  })
})

describe('la liste des cours ne se charge pas', () => {
  it('passe en erreur, et réessayer relance le chargement', async () => {
    const { tunnel, appelsCours } = nouveauTunnel()
    tunnel.ouvrir()

    appelsCours[0].resoudre({ ok: false, erreur: { statut: 503, code: 'indisponible' } })
    await laisserFiler()

    expect(tunnel.etat.ecran.nom).toBe('cours')
    expect(tunnel.etat.cours?.etat).toBe('en-erreur')

    tunnel.reessayer()

    expect(tunnel.etat.cours).toEqual({ etat: 'en-chargement' })

    appelsCours[1].resoudre({ ok: true, donnees: { courses: [TOUR] } })
    await laisserFiler()

    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR] })
  })

  it('réessayer ne relance rien tant que la liste n’est pas en erreur', () => {
    const { tunnel, appelsCours } = nouveauTunnel()
    tunnel.ouvrir()

    tunnel.reessayer()

    expect(appelsCours).toHaveLength(1)
  })
})

describe('choisir un cours', () => {
  it('affiche les créneaux du cours en chargement, sur les 90 prochains jours', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()

    tunnel.choisirCours(TOUR)

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })
    expect(appelsCreneaux).toHaveLength(1)
    expect(appelsCreneaux[0].idCours).toBe('tour')
    expect(appelsCreneaux[0].depuis).toEqual(new Date('2026-10-22T10:00:00Z'))
    expect(appelsCreneaux[0].jusqua).toEqual(new Date('2027-01-20T10:00:00Z'))
  })

  it('affiche les créneaux à venir triés par date, sans ceux déjà passés', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()
    const passe = creneau('passe', '2026-10-22T09:00:00Z')
    const lointain = creneau('lointain', '2026-12-05T14:00:00Z')
    const proche = creneau('proche', '2026-10-24T14:00:00Z')

    tunnel.choisirCours(TOUR)
    appelsCreneaux[0].resoudre({ ok: true, donnees: { slots: [lointain, passe, proche] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [proche, lointain] })
  })

})

describe('revenir aux cours', () => {
  it('ramène des créneaux à la liste des cours, déjà prête', async () => {
    const { tunnel, appelsCours } = await tunnelSurLesCours()
    tunnel.choisirCours(TOUR)

    tunnel.revenir()

    expect(tunnel.etat.ecran).toEqual({ nom: 'cours' })
    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR, MODELAGE] })
    expect(appelsCours).toHaveLength(1)
  })

  it('n’affiche ni chargement ni erreur des créneaux sur la liste des cours', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()
    const vus: string[] = []
    tunnel.choisirCours(TOUR)
    tunnel.revenir()
    tunnel.abonner(() => vus.push(`${tunnel.etat.ecran.nom}:${tunnel.etat.cours?.etat}`))

    expect(tunnel.etat.ecran).toEqual({ nom: 'cours' })
    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR, MODELAGE] })

    appelsCreneaux[0].resoudre({ ok: false, erreur: { statut: 503, code: 'indisponible' } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'cours' })
    expect(tunnel.etat.cours).toEqual({ etat: 'prete', liste: [TOUR, MODELAGE] })
    expect(vus).not.toHaveLength(0)
    expect(vus.every((vu) => vu === 'cours:prete')).toBe(true)
  })
})

describe('les créneaux ne se chargent pas', () => {
  it('passent en erreur sur la liste des créneaux, et réessayer relance leur chargement', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()
    const proche = creneau('proche', '2026-10-24T14:00:00Z')
    tunnel.choisirCours(TOUR)

    appelsCreneaux[0].resoudre({ ok: false, erreur: { statut: null, code: 'reseau' } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux?.etat).toBe('en-erreur')
    expect(tunnel.etat.cours?.etat).toBe('prete')

    tunnel.reessayer()

    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })
    expect(appelsCreneaux).toHaveLength(2)
    expect(appelsCreneaux[1].idCours).toBe('tour')

    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [proche] } })
    await laisserFiler()

    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [proche] })
  })
})

describe('changer de cours pendant un chargement', () => {
  it('affiche les créneaux du dernier cours choisi, même si l’ancienne réponse arrive après', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()
    const creneauTour = creneau('tour-1', '2026-10-24T14:00:00Z')
    const creneauModelage = creneau('modelage-1', '2026-10-25T14:00:00Z')

    tunnel.choisirCours(TOUR)
    tunnel.revenir()
    tunnel.choisirCours(MODELAGE)

    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [creneauModelage] } })
    await laisserFiler()
    appelsCreneaux[0].resoudre({ ok: true, donnees: { slots: [creneauTour] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: MODELAGE })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [creneauModelage] })
  })

  it('n’affiche pas l’erreur d’un ancien cours sur les créneaux du nouveau', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCours()

    tunnel.choisirCours(TOUR)
    tunnel.revenir()
    tunnel.choisirCours(MODELAGE)

    appelsCreneaux[0].resoudre({ ok: false, erreur: { statut: 503, code: 'indisponible' } })
    await laisserFiler()

    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })
  })
})

describe('choisir un créneau', () => {
  it('affiche l’écran des coordonnées pour ce créneau', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])

    tunnel.choisirCreneau(PROCHE)

    expect(tunnel.etat.ecran).toMatchObject({ nom: 'coordonnees', cours: TOUR, creneau: PROCHE })
  })

  it('ne peut pas choisir un créneau complet', async () => {
    const complet = { ...creneau('complet', '2026-10-23T14:00:00Z'), seats_available: 0 }
    const { tunnel } = await tunnelSurLesCreneaux([complet, PROCHE])

    tunnel.choisirCreneau(complet)

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
  })
})

describe('revenir aux créneaux', () => {
  it('ramène des coordonnées aux créneaux du même cours, sans les recharger', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)

    tunnel.revenir()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [PROCHE] })
    expect(appelsCreneaux).toHaveLength(1)
  })

  it('oublie les erreurs signalées sur les coordonnées', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)
    tunnel.envoyer()

    tunnel.revenir()
    tunnel.choisirCreneau(PROCHE)

    expect(tunnel.etat.erreurs).toEqual({})
  })

  it('garde la saisie et le nombre de places', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)
    tunnel.saisir('first_name', 'Camille')
    tunnel.saisir('email', 'camille@exemple.fr')
    tunnel.changerPlaces(2)

    tunnel.revenir()
    tunnel.choisirCreneau(PROCHE)

    expect(tunnel.etat.saisie).toEqual({
      first_name: 'Camille',
      last_name: '',
      email: 'camille@exemple.fr',
      phone: '',
      notes: '',
    })
    expect(tunnel.etat.places).toBe(2)
  })
})

describe('saisir ses coordonnées', () => {
  it('ne demande pas le téléphone quand l’atelier ne l’exige pas', () => {
    const { tunnel } = nouveauTunnel()

    expect(tunnel.etat.telephoneDemande).toBe(false)
  })

  it('demande le téléphone quand l’atelier l’exige', () => {
    const { tunnel } = nouveauTunnel({
      ...ATELIER,
      booking_policy: { ...ATELIER.booking_policy, requires_phone: true },
    })

    expect(tunnel.etat.telephoneDemande).toBe(true)
  })
})

// L'atelier de test accepte au plus 4 places par réservation.
describe('choisir le nombre de places', () => {
  it('commence à une place', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])

    tunnel.choisirCreneau(PROCHE)

    expect(tunnel.etat.places).toBe(1)
  })

  it('ne dépasse pas le plafond de l’atelier', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)

    tunnel.changerPlaces(3)
    expect(tunnel.etat.places).toBe(3)

    tunnel.changerPlaces(6)
    expect(tunnel.etat.places).toBe(4)
    expect(tunnel.etat.ecran).toMatchObject({ nom: 'coordonnees', placesMaximum: 4 })
  })

  it('ne dépasse pas les places restantes du créneau', async () => {
    const presqueComplet = { ...PROCHE, seats_available: 2 }
    const { tunnel } = await tunnelSurLesCreneaux([presqueComplet])
    tunnel.choisirCreneau(presqueComplet)

    tunnel.changerPlaces(4)

    expect(tunnel.etat.places).toBe(2)
    expect(tunnel.etat.ecran).toMatchObject({ nom: 'coordonnees', placesMaximum: 2 })
  })

  it('ne descend pas sous une place, même pour une valeur absurde', async () => {
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)

    tunnel.changerPlaces(0)
    expect(tunnel.etat.places).toBe(1)

    tunnel.changerPlaces(3)
    tunnel.changerPlaces(Number(''))
    expect(tunnel.etat.places).toBe(1)

    tunnel.changerPlaces(Number.NaN)
    expect(tunnel.etat.places).toBe(1)
  })

  it('garde le nombre de places en changeant de créneau dans le même cours, ramené au nouveau plafond', async () => {
    const lointain = creneau('lointain', '2026-12-05T14:00:00Z')
    const presqueComplet = { ...creneau('presque-complet', '2026-10-25T14:00:00Z'), seats_available: 2 }
    const { tunnel } = await tunnelSurLesCreneaux([PROCHE, presqueComplet, lointain])

    tunnel.choisirCreneau(PROCHE)
    tunnel.changerPlaces(3)
    tunnel.revenir()
    tunnel.choisirCreneau(lointain)
    expect(tunnel.etat.places).toBe(3)

    tunnel.revenir()
    tunnel.choisirCreneau(presqueComplet)
    expect(tunnel.etat.places).toBe(2)
  })

  it('revient à une place en changeant de cours', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCreneaux([PROCHE])
    const creneauModelage = creneau('modelage-1', '2026-10-25T14:00:00Z')
    tunnel.choisirCreneau(PROCHE)
    tunnel.changerPlaces(3)

    tunnel.revenir()
    tunnel.revenir()
    tunnel.choisirCours(MODELAGE)
    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [creneauModelage] } })
    await laisserFiler()
    tunnel.choisirCreneau(creneauModelage)

    expect(tunnel.etat.places).toBe(1)
  })

  it('garde le nombre de places en rechoisissant le même cours', async () => {
    const { tunnel, appelsCreneaux } = await tunnelSurLesCreneaux([PROCHE])
    tunnel.choisirCreneau(PROCHE)
    tunnel.changerPlaces(3)

    tunnel.revenir()
    tunnel.revenir()
    tunnel.choisirCours(TOUR)
    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [PROCHE] } })
    await laisserFiler()
    tunnel.choisirCreneau(PROCHE)

    expect(tunnel.etat.places).toBe(3)
  })
})

describe('envoyer sa réservation', () => {
  it('n’envoie rien et signale chaque champ invalide quand la saisie est incomplète', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    tunnel.saisir('first_name', 'Camille')
    tunnel.saisir('email', 'camille@')

    tunnel.envoyer()

    expect(appelsReservation).toHaveLength(0)
    expect(tunnel.etat.ecran).toMatchObject({ nom: 'coordonnees', creneau: PROCHE })
    expect(Object.keys(tunnel.etat.erreurs).sort()).toEqual(['email', 'last_name'])
  })

  it('affiche l’écran d’attente pendant l’envoi, puis la confirmation avec le code et le total', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)
    tunnel.saisir('notes', '  Première fois  ')
    tunnel.changerPlaces(2)

    tunnel.envoyer()

    expect(tunnel.etat.ecran).toEqual({ nom: 'envoi', cours: TOUR, creneau: PROCHE })
    expect(tunnel.etat.erreurs).toEqual({})
    expect(appelsReservation).toHaveLength(1)
    expect(appelsReservation[0].corps).toEqual({
      slot_id: 'proche',
      seats: 2,
      customer: { first_name: 'Camille', last_name: 'Martin', email: 'camille@exemple.fr', phone: undefined },
      notes: 'Première fois',
    })

    appelsReservation[0].resoudre({
      ok: true,
      donnees: { booking_id: 'b1', status: 'confirmed', confirmation_code: 'DSY-4821', total_cents: 13000 },
    })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({
      nom: 'confirmation',
      cours: TOUR,
      creneau: PROCHE,
      code: 'DSY-4821',
      total: 13000,
      email: 'camille@exemple.fr',
    })
  })

  it('n’envoie qu’une seule réservation sur un double-clic', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)

    tunnel.envoyer()
    tunnel.envoyer()

    expect(appelsReservation).toHaveLength(1)
  })

  it('ne se laisse pas fermer pendant l’envoi', async () => {
    const { tunnel, demandes } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)
    tunnel.envoyer()

    tunnel.fermer()

    expect(demandes).toEqual(['ouverture'])
    expect(tunnel.etat.ecran.nom).toBe('envoi')
  })
})

describe('terminer sa réservation', () => {
  it('efface la saisie et demande la fermeture', async () => {
    const { tunnel, demandes } = await tunnelSurLaConfirmation()

    tunnel.terminer()

    expect(tunnel.etat.saisie).toEqual(SAISIE_VIDE)
    expect(demandes).toEqual(['ouverture', 'fermeture'])

    tunnel.hoteAFerme()

    expect(tunnel.etat.ecran.nom).toBe('bouton')
  })

  it('efface aussi la saisie quand on ferme l’écran de confirmation', async () => {
    const { tunnel, demandes } = await tunnelSurLaConfirmation()

    tunnel.fermer()

    expect(tunnel.etat.saisie).toEqual(SAISIE_VIDE)
    expect(demandes).toEqual(['ouverture', 'fermeture'])
  })

  it('efface aussi la saisie quand la page hôte referme l’écran de confirmation', async () => {
    const { tunnel } = await tunnelSurLaConfirmation()

    tunnel.hoteAFerme()

    expect(tunnel.etat.saisie).toEqual(SAISIE_VIDE)
  })

  it('garde la saisie quand on ferme le tunnel avant la fin', async () => {
    const { tunnel } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)

    tunnel.fermer()
    tunnel.hoteAFerme()

    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
  })
})

describe('l’envoi échoue', () => {
  // Transitoire : le point d'entrée traite l'échec qu'on lui rend, jusqu'à
  // ce que les échecs d'envoi rejoignent le tunnel (ticket 06).
  it('ramène aux coordonnées avec la saisie intacte, et rend l’échec', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)

    const envoi = tunnel.envoyer()
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 503, code: 'indisponible' } })

    expect(await envoi).toEqual({ statut: 503, code: 'indisponible' })
    expect(tunnel.etat.ecran).toEqual({ nom: 'coordonnees', cours: TOUR, creneau: PROCHE, placesMaximum: 4 })
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
  })

  it('fait apparaître le téléphone en erreur quand l’atelier l’exige désormais', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)

    const envoi = tunnel.envoyer()
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 422, code: 'phone_required' } })

    expect(await envoi).toBeNull()
    expect(tunnel.etat.ecran.nom).toBe('coordonnees')
    expect(tunnel.etat.telephoneDemande).toBe(true)
    expect(Object.keys(tunnel.etat.erreurs)).toEqual(['phone'])
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
  })
})

// Un tunnel sur les coordonnées du créneau proche, Camille demande 3 places
// et la réservation est partie.
async function tunnelEnEnvoi() {
  const outils = await tunnelSurLesCoordonnees()
  saisirCamille(outils.tunnel)
  outils.tunnel.changerPlaces(3)
  outils.tunnel.envoyer()

  return outils
}

describe('la place est partie pendant la saisie', () => {
  it('voit le refus et les places restantes, saisie intacte', async () => {
    const { tunnel, appelsReservation } = await tunnelEnEnvoi()
    const vus: string[] = []
    tunnel.abonner(() => vus.push(tunnel.etat.ecran.nom))

    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 1 } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toMatchObject({
      nom: 'place-partie',
      cours: TOUR,
      creneau: { ...PROCHE, seats_available: 1 },
    })
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
    expect(tunnel.etat.places).toBe(3)
    expect(vus).toEqual(['place-partie'])
  })

  it('ne se voit plus proposer les créneaux d’avant le refus, rechargés', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()

    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 0 } })
    await laisserFiler()

    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })
    expect(appelsCreneaux).toHaveLength(2)
    expect(appelsCreneaux[1].idCours).toBe('tour')
  })

  it('propose les trois prochains créneaux disponibles, une fois rechargés', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const complet = { ...creneau('complet', '2026-10-25T14:00:00Z'), seats_available: 0 }
    const suivants = [
      creneau('j4', '2026-10-26T14:00:00Z'),
      creneau('j5', '2026-10-27T14:00:00Z'),
      creneau('j6', '2026-10-28T14:00:00Z'),
    ]
    const lointain = creneau('lointain', '2026-12-05T14:00:00Z')

    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 0 } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toMatchObject({ nom: 'place-partie', alternatives: [] })

    appelsCreneaux[1].resoudre({
      ok: true,
      donnees: { slots: [lointain, { ...PROCHE, seats_available: 0 }, complet, ...suivants] },
    })
    await laisserFiler()

    expect(tunnel.etat.ecran).toMatchObject({ nom: 'place-partie', alternatives: suivants })
  })

  it('les places restantes suivent les créneaux rechargés, plus récents que le refus', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const devenuComplet = { ...PROCHE, seats_available: 0 }
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 1 } })
    await laisserFiler()

    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [devenuComplet] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toMatchObject({ nom: 'place-partie', creneau: devenuComplet })
  })

  it('choisir une alternative mène aux coordonnées, places ramenées au plafond du créneau', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const presqueComplet = { ...creneau('presque-complet', '2026-10-26T14:00:00Z'), seats_available: 2 }
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 0 } })
    await laisserFiler()
    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [presqueComplet] } })
    await laisserFiler()

    tunnel.choisirCreneau(presqueComplet)

    expect(tunnel.etat.ecran).toEqual({ nom: 'coordonnees', cours: TOUR, creneau: presqueComplet, placesMaximum: 2 })
    expect(tunnel.etat.places).toBe(2)
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
  })

  it('reprendre le même créneau ramène la demande aux places restantes, en un seul changement', async () => {
    const { tunnel, appelsReservation } = await tunnelEnEnvoi()
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 1 } })
    await laisserFiler()
    const ecran = tunnel.etat.ecran
    if (ecran.nom !== 'place-partie') throw new Error('attendu : place-partie')
    const vus: string[] = []
    tunnel.abonner(() => vus.push(tunnel.etat.ecran.nom))

    tunnel.choisirCreneau(ecran.creneau)

    expect(tunnel.etat.ecran).toMatchObject({ nom: 'coordonnees', creneau: { slot_id: 'proche' }, placesMaximum: 1 })
    expect(tunnel.etat.places).toBe(1)
    expect(vus).toEqual(['coordonnees'])
  })
})

describe('le créneau a été annulé pendant la saisie', () => {
  it('en est informée, saisie intacte, et les créneaux sont rechargés', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const vus: string[] = []
    tunnel.abonner(() => vus.push(tunnel.etat.ecran.nom))

    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_cancelled' } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneau-annule', cours: TOUR })
    expect(vus).toEqual(['creneau-annule'])
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })
    expect(appelsCreneaux).toHaveLength(2)
  })
})

describe('voir toutes les dates après un refus', () => {
  it('affiche les créneaux en chargement tant qu’ils ne sont pas rechargés, puis les créneaux rafraîchis', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const rafraichi = { ...PROCHE, seats_available: 0 }
    const autre = creneau('autre', '2026-10-26T14:00:00Z')
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 0 } })
    await laisserFiler()

    tunnel.voirToutesLesDates()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'en-chargement' })

    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [rafraichi, autre] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [rafraichi, autre] })
  })

  it('affiche directement les créneaux déjà rechargés, saisie intacte, depuis un créneau annulé', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const autre = creneau('autre', '2026-10-26T14:00:00Z')
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_cancelled' } })
    await laisserFiler()
    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [autre] } })
    await laisserFiler()

    tunnel.voirToutesLesDates()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: TOUR })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [autre] })
    expect(tunnel.etat.saisie.email).toBe('camille@exemple.fr')
    expect(appelsCreneaux).toHaveLength(2)
  })
})

describe('les créneaux rechargés après un refus arrivent en retard', () => {
  it('ne quittent pas les coordonnées où la personne est repartie', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_full', available: 1 } })
    await laisserFiler()
    const ecran = tunnel.etat.ecran
    if (ecran.nom !== 'place-partie') throw new Error('attendu : place-partie')
    tunnel.choisirCreneau(ecran.creneau)
    const coordonnees = tunnel.etat.ecran

    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [PROCHE] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toBe(coordonnees)
    expect(tunnel.etat.places).toBe(1)
  })

  it('n’écrasent pas les créneaux d’un autre cours choisi entre-temps', async () => {
    const { tunnel, appelsReservation, appelsCreneaux } = await tunnelEnEnvoi()
    const creneauModelage = creneau('modelage-1', '2026-10-25T14:00:00Z')
    appelsReservation[0].resoudre({ ok: false, erreur: { statut: 409, code: 'slot_cancelled' } })
    await laisserFiler()

    tunnel.voirToutesLesDates()
    tunnel.revenir()
    tunnel.choisirCours(MODELAGE)
    appelsCreneaux[2].resoudre({ ok: true, donnees: { slots: [creneauModelage] } })
    await laisserFiler()
    appelsCreneaux[1].resoudre({ ok: true, donnees: { slots: [PROCHE] } })
    await laisserFiler()

    expect(tunnel.etat.ecran).toEqual({ nom: 'creneaux', cours: MODELAGE })
    expect(tunnel.etat.creneaux).toEqual({ etat: 'prete', liste: [creneauModelage] })
  })
})

describe('la page hôte referme le tunnel pendant l’envoi', () => {
  // Transitoire : la confirmation est perdue. Le ticket 07 la garde en
  // attente pour la prochaine ouverture.
  it('reste fermé quand la réponse arrive', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)
    tunnel.envoyer()

    tunnel.hoteAFerme()
    appelsReservation[0].resoudre({
      ok: true,
      donnees: { booking_id: 'b1', status: 'confirmed', confirmation_code: 'DSY-4821', total_cents: 6500 },
    })
    await laisserFiler()

    expect(tunnel.etat.ecran.nom).toBe('bouton')
  })

  it('n’envoie pas une seconde réservation si on rouvre le tunnel avant la réponse', async () => {
    const { tunnel, appelsReservation } = await tunnelSurLesCoordonnees()
    saisirCamille(tunnel)
    tunnel.envoyer()
    tunnel.hoteAFerme()

    tunnel.ouvrir()
    tunnel.choisirCours(TOUR)
    tunnel.choisirCreneau(PROCHE)
    tunnel.envoyer()

    expect(appelsReservation).toHaveLength(1)
  })
})
