// Accès à l'API Daisy.
//
// Ce fichier ne fait que transporter : il appelle, il lit le JSON, il normalise
// les erreurs. Il ne décide de rien. Ce qu'on AFFICHE pour chaque erreur est
// décidé ailleurs, dans le tunnel.
//
// Toutes les fonctions renvoient un Resultat plutôt que de lever une exception :
// comme ça le compilateur oblige à traiter le cas d'erreur, et les états dégradés
// ne peuvent pas être oubliés par distraction.

import { clePublique } from './pont'

const BASE = 'http://localhost:3001/public/v1'

// La spec ne dit pas COMMENT la clé publique voyage : elle décrit l'attribut
// `data-studio` du snippet, et des endpoints sans identifiant d'atelier
// (`/studio`, `/courses`). Il faut donc bien qu'elle parte avec chaque appel.
const ENTETE_CLE = 'X-Daisy-Studio'

// --- Ce que renvoie l'API  -------------------------

export type Studio = {
  studio_id: string
  name: string
  timezone: string
  currency: string

  branding: {
    primary_color: string
    logo_url: string | null
  }

  booking_policy: {
    requires_phone: boolean
    cancellation_hours: number
    max_seats_per_booking: number
  }
}

export type Course = {
  course_id: string
  name: string
  description: string
  duration_minutes: number
  price_cents: number
  image_url: string | null
  level: string
}

export type Slot = {
  slot_id: string
  starts_at: string
  seats_total: number
  seats_available: number

  // Le prix du créneau peut différer de celui du cours (tarif week-end).
  // C'est celui-ci qui fait foi.
  price_cents: number
}

export type Customer = {
  first_name: string
  last_name: string
  email: string
  phone?: string
}

export type Booking = {
  booking_id: string
  status: string
  confirmation_code: string
  total_cents: number
}

// --- Erreurs ----------------------------------------------------------------

export type Erreur = {
  // null quand on n'a même pas eu de réponse : coupure réseau, serveur injoignable.
  statut: number | null

  // Le champ `error` de l'API ('slot_full', 'phone_required'…),
  // ou 'reseau' / 'illisible' quand l'erreur vient de plus bas.
  code: string

  // Présent sur un 409 slot_full : combien de places il reste réellement.
  available?: number
}

export type Resultat<T> =
  | { ok: true; donnees: T }
  | { ok: false; erreur: Erreur }

// --- Appel générique --------------------------------------------------------

async function requete<T>(chemin: string, options: RequestInit = {}): Promise<Resultat<T>> {
  let reponse: Response

  const cle = clePublique()

  try {
    reponse = await fetch(`${BASE}${chemin}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(cle ? { [ENTETE_CLE]: cle } : {}),
        ...options.headers,
      },
    })
  } catch {
    // Ici on n'a pas de code HTTP : le navigateur n'a pas réussi à joindre le serveur.
    // Coupure réseau, CORS refusé, serveur éteint — on ne peut pas les distinguer.
    return { ok: false, erreur: { statut: null, code: 'reseau' } }
  }

  let corps: unknown = null

  try {
    corps = await reponse.json()
  } catch {
    // Réponse non-JSON. Sur une réponse en échec ce n'est pas grave,
    // on a quand même le code HTTP pour décider quoi faire.
    if (reponse.ok) {
      return { ok: false, erreur: { statut: reponse.status, code: 'illisible' } }
    }
  }

  if (!reponse.ok) {
    const details = (corps ?? {}) as { error?: string; available?: number }

    return {
      ok: false,
      erreur: {
        statut: reponse.status,
        code: details.error ?? 'inconnu',
        available: details.available,
      },
    }
  }

  return { ok: true, donnees: corps as T }
}

// --- Endpoints --------------------------------------------------------------

export function getStudio() {
  return requete<Studio>('/studio')
}

export function getCourses() {
  return requete<{ courses: Course[] }>('/courses')
}

// La spec impose une fenêtre de 90 jours maximum, au-delà elle répond 400.
export function getSlots(courseId: string, depuis: Date, jusqua: Date) {
  const params = new URLSearchParams({
    from: depuis.toISOString().slice(0, 10),
    to: jusqua.toISOString().slice(0, 10),
  })

  return requete<{ slots: Slot[] }>(`/courses/${courseId}/slots?${params}`)
}

export function postBooking(corps: {
  slot_id: string
  seats: number
  customer: Customer
  notes?: string
}) {
  return requete<Booking>('/bookings', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}
