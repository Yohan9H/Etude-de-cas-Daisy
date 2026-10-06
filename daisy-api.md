# `daisy-api.md` — Annexe du Sujet B

API publique de réservation exposée par Daisy, consommée par le widget que l'artisan pose sur son site.

Comme pour le sujet A, tu peux mocker ce service. Ce qui compte, c'est le comportement de ton widget face à ses réponses.

---

## Base

```
https://api.daisy.example/public/v1
```

**Pas de secret dans le widget.** L'authentification se fait par une clé publique, visible dans le code source du site de l'artisan :

```html
<div id="daisy-booking" data-studio="std_pk_7f2a9c"></div>
<script src="https://widget.daisy.example/v1.js" async></script>
```

Cette clé identifie l'atelier et rien d'autre. Elle ne donne accès qu'aux endpoints ci-dessous, en lecture, plus la création de réservation.

**CORS.** L'API accepte les requêtes depuis les domaines déclarés par l'artisan dans son back-office. Un domaine non déclaré reçoit un `403`. En pratique, les artisans oublient de déclarer leur domaine environ une fois sur trois lors de la première installation.

---

## Endpoints

### `GET /studio`

Informations d'affichage de l'atelier.

```json
{
  "studio_id": "std_2201",
  "name": "Atelier Terre & Feu",
  "timezone": "Europe/Paris",
  "currency": "EUR",
  "branding": {
    "primary_color": "#C4643A",
    "logo_url": "https://cdn.daisy.example/logos/std_2201.png"
  },
  "booking_policy": {
    "requires_phone": true,
    "cancellation_hours": 48,
    "max_seats_per_booking": 4
  }
}
```

### `GET /courses`

```json
{
  "courses": [
    {
      "course_id": "crs_118",
      "name": "Tour de potier — débutant",
      "description": "Deux heures d'initiation au tournage. Tout le matériel est fourni, prévoyez des vêtements qui ne craignent rien.",
      "duration_minutes": 120,
      "price_cents": 7500,
      "image_url": "https://cdn.daisy.example/courses/crs_118.jpg",
      "level": "debutant"
    }
  ]
}
```

Certains ateliers ont **plus de 40 cours**. Certaines descriptions font 800 caractères, d'autres sont vides. Certains cours n'ont pas d'image.

### `GET /courses/{course_id}/slots?from=&to=`

```json
{
  "slots": [
    {
      "slot_id": "slt_44710",
      "starts_at": "2027-01-16T14:00:00+01:00",
      "seats_total": 8,
      "seats_available": 2,
      "price_cents": 7500
    },
    {
      "slot_id": "slt_44711",
      "starts_at": "2027-01-23T14:00:00+01:00",
      "seats_total": 8,
      "seats_available": 0,
      "price_cents": 8500
    }
  ]
}
```

Le prix peut varier d'un créneau à l'autre (tarif week-end, vacances). Les créneaux complets sont renvoyés, pas filtrés.

Fenêtre maximale : 90 jours. Au-delà, `400`.

### `POST /bookings`

```json
{
  "slot_id": "slt_44710",
  "seats": 2,
  "customer": {
    "first_name": "Camille",
    "last_name": "Roux",
    "email": "camille@example.com",
    "phone": "+33612345678"
  },
  "notes": "Je suis gauchère"
}
```

**Réponse `201`**
```json
{
  "booking_id": "bkg_88120",
  "status": "confirmed",
  "confirmation_code": "TF-3K9Q",
  "total_cents": 15000
}
```

**Erreurs possibles**

| Code | `error` | Signification |
|---|---|---|
| `409` | `slot_full` | Plus assez de places. Le corps contient `available`. |
| `409` | `slot_cancelled` | L'artisan a annulé le créneau entre-temps. |
| `422` | `phone_required` | La politique de l'atelier exige un téléphone. |
| `422` | `too_many_seats` | Au-delà de `max_seats_per_booking`. |
| `429` | `rate_limited` | Plus de 20 créations par IP et par heure. |
| `403` | `origin_not_allowed` | Domaine non déclaré. |

**Latence.** Cet endpoint met **entre 1,5 et 4 secondes** à répondre : il écrit en base, propage aux partenaires connectés et envoie l'email de confirmation de façon synchrone. C'est une contrainte connue, non négociable pour cet exercice.

---

## Réalité du terrain

Ces éléments sont ceux qui posent réellement problème :

- Les sites hôtes sont majoritairement **Wix, Squarespace, WordPress** et des sites artisanaux. Certains ont un CSS qui applique des styles globaux à `button`, `input`, `div`, parfois avec `!important`.
- Environ **60% du trafic est mobile**, souvent depuis Instagram.
- Certains hôtes chargent déjà React, d'autres jQuery, d'autres rien.
- Le widget est parfois placé dans un conteneur étroit (colonne latérale de 320px), parfois en pleine largeur.
- Les artisans installent seuls, sans assistance. Un widget qui ne s'affiche pas génère un ticket support — c'est le motif de contact numéro 2 côté care.
- Plusieurs artisans ont demandé à changer les couleurs et la police pour coller à leur site.