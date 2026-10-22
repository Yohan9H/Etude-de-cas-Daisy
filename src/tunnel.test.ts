import { describe, expect, it } from 'vitest'

import type { Course, Resultat, Slot, Studio } from './api'
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
  }

  return { api, appelsCours, appelsCreneaux }
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

function nouveauTunnel() {
  const { api, appelsCours, appelsCreneaux } = fausseApi()
  const { hote, demandes } = fauxHote()
  const tunnel = creerTunnel({ atelier: ATELIER, api, hote, horloge: horlogeFixe })

  return { tunnel, appelsCours, appelsCreneaux, demandes }
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

