import { describe, expect, it } from 'vitest'

import type { Course, Resultat, Studio } from './api'
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

// Une promesse que le test résout quand il veut : c'est lui qui décide de
// l'ordre et du moment des réponses, ou qu'une réponse n'arrive jamais.
function reponseEnAttente<T>() {
  let resoudre!: (resultat: Resultat<T>) => void
  const promesse = new Promise<Resultat<T>>((r) => (resoudre = r))

  return { promesse, resoudre }
}

function fausseApi() {
  const appelsCours: ReturnType<typeof reponseEnAttente<{ courses: Course[] }>>[] = []

  const api: ApiTunnel = {
    getCourses() {
      const reponse = reponseEnAttente<{ courses: Course[] }>()
      appelsCours.push(reponse)
      return reponse.promesse
    },
  }

  return { api, appelsCours }
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
  const { api, appelsCours } = fausseApi()
  const { hote, demandes } = fauxHote()
  const tunnel = creerTunnel({ atelier: ATELIER, api, hote, horloge: horlogeFixe })

  return { tunnel, appelsCours, demandes }
}

// Laisse les promesses déjà résolues produire leurs effets.
const laisserFiler = () => new Promise((r) => setTimeout(r, 0))

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
