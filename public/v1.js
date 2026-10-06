/* Le loader Daisy.
 *
 * C'est le SEUL code de Daisy qui tourne dans la page de l'artisan.
 * Et c'est la partie gelée du contrat : 70 sites ont collé les deux lignes qui
 * l'appellent, on ne pourra jamais leur demander de les changer.
 *
 * Donc : aucune dépendance, aucune logique métier, aucun appel à l'API,
 * aucune donnée client. Il crée une iframe et relaie quatre messages.
 *
 * RÈGLE ABSOLUE : une fois créée, l'iframe ne bouge plus jamais dans le DOM.
 * La déplacer la rechargerait — le widget repartirait de zéro et l'utilisateur
 * perdrait son formulaire. D'où le <dialog> posé autour d'elle dès le départ.
 *
 * Écrit en JavaScript classique (var, function) et sans étape de build :
 * le fichier livré est exactement celui qu'on lit ici.
 *
 *
 * LE PROTOCOLE DE MESSAGES
 * ------------------------
 * Du widget vers le loader :
 *   { source: 'daisy-widget', type: 'ready'    }  je suis chargé, tout va bien
 *   { source: 'daisy-widget', type: 'expand'   }  ouvre-moi en plein écran
 *   { source: 'daisy-widget', type: 'collapse' }  referme-moi
 *
 * Du loader vers le widget :
 *   { source: 'daisy-loader', type: 'closed'   }  je t'ai refermé, reviens au bouton
 *
 * Deux protections obligatoires, dans les deux sens :
 *   - vérifier event.origin sur CHAQUE message reçu ;
 *   - ne jamais utiliser '*' comme destination d'un postMessage.
 */

(function () {
  'use strict'

  // En production : 'https://widget.daisy.example'
  var ORIGINE_WIDGET = 'http://localhost:5173'

  // Page de réservation hébergée par Daisy, affichée si l'iframe ne charge pas.
  var LIEN_SECOURS = 'https://daisy.example/reserver/'

  // Au-delà de ce délai sans message 'ready', on affiche le lien de secours.
  // Le repli s'AJOUTE, il ne remplace pas : si 'ready' arrive après, on le retire.
  // C'est ce qui rend le choix du chiffre peu risqué.
  var DELAI_SECOURS = 8000

  var HAUTEUR_BOUTON = 64

  var SOURCE_WIDGET = 'daisy-widget'
  var SOURCE_LOADER = 'daisy-loader'

  // Tout l'état du loader. Volontairement minuscule.
  var conteneur = null
  var iframe = null
  var dialogue = null
  var lien = null
  var minuteur = null
  var pret = false
  var pleinEcran = false
  var defilementInitial = ''

  // --- Styles --------------------------------------------------------------

  // Applique des styles en inline ET en !important.
  //
  // Pourquoi les deux : on est dans la page de l'artisan, et son CSS peut nous
  // viser. Un style inline bat une règle normale, mais il PERD contre un
  // !important venu d'une feuille de style. Seul un !important inline gagne.
  // C'est la seule partie du système où on doit encore se battre dans la cascade.
  function poserStyles(element, styles) {
    for (var propriete in styles) {
      if (!Object.prototype.hasOwnProperty.call(styles, propriete)) continue

      element.style.setProperty(propriete, styles[propriete], 'important')
    }
  }

  // --- 1 & 2. L'iframe en mode bouton --------------------------------------

  function creerIframe(cle) {
    var cadre = document.createElement('iframe')

    // Tout ce qu'on transmet au widget : la clé de l'atelier, et le site
    // sur lequel il est posé. Rien d'autre ne traverse dans ce sens.
    var url =
      ORIGINE_WIDGET +
      '/?studio=' + encodeURIComponent(cle) +
      '&host=' + encodeURIComponent(window.location.origin)

    cadre.setAttribute('src', url)

    // Annoncé par les lecteurs d'écran en entrant dans l'iframe.
    cadre.setAttribute('title', 'Réservation en ligne')

    poserStyles(cadre, {
      display: 'block',
      width: '100%',

      // C'est le <dialog> qui porte la hauteur (64 px ou plein écran).
      // L'iframe le remplit, dans les deux modes.
      height: '100%',
      border: '0',
      margin: '0',
      padding: '0',

      // Au cas où l'hôte aurait des règles sur iframe.
      'max-width': 'none',
      'min-width': '0',
      'max-height': 'none',

      // Le widget pose son propre fond ; ici on laisse voir celui du site.
      'background-color': 'transparent'
    })

    return cadre
  }

  // --- 3. Les messages du widget -------------------------------------------

  function surMessage(evenement) {
    // N'importe quelle page peut nous envoyer un message.
    // Ces deux vérifications sont la seule chose qui nous protège.
    if (evenement.origin !== ORIGINE_WIDGET) return

    var message = evenement.data

    if (!message || message.source !== SOURCE_WIDGET) return

    if (message.type === 'ready') {
      pret = true

      if (minuteur) {
        clearTimeout(minuteur)
        minuteur = null
      }

      retirerLien()
      return
    }

    if (message.type === 'expand') {
      ouvrirPleinEcran()
      return
    }

    if (message.type === 'collapse') {
      refermer()
    }
  }

  function envoyerAuWidget(type) {
    if (!iframe || !iframe.contentWindow) return

    iframe.contentWindow.postMessage({ source: SOURCE_LOADER, type: type }, ORIGINE_WIDGET)
  }

  // --- 4. Les deux modes ---------------------------------------------------

  // Le <dialog> est créé une fois pour toutes, autour de l'iframe. On ne fait
  // que changer ses styles et le rouvrir en modal : aucun déplacement dans le
  // DOM, donc aucun rechargement de l'iframe.

  function appliquerModeBouton() {
    poserStyles(dialogue, {
      position: 'static',
      inset: 'auto',
      display: 'block',
      width: '100%',
      height: HAUTEUR_BOUTON + 'px',
      'max-width': 'none',
      'max-height': 'none',
      margin: '0',
      padding: '0',
      border: '0',
      'background-color': 'transparent',
      overflow: 'hidden'
    })
  }

  function appliquerModePleinEcran() {
    poserStyles(dialogue, {
      position: 'fixed',
      inset: '0',
      display: 'block',
      width: '100%',
      height: '100dvh',
      'max-width': 'none',
      'max-height': 'none',
      margin: '0',
      padding: '0',
      border: '0',
      'background-color': 'transparent',
      overflow: 'hidden'
    })
  }

  function ouvrirPleinEcran() {
    if (!dialogue || pleinEcran) return

    pleinEcran = true

    // On referme le mode bouton pour pouvoir rouvrir en modal.
    // close() ne retire rien du DOM : l'iframe reste chargée.
    if (dialogue.open) dialogue.close()

    appliquerModePleinEcran()

    // showModal() rend le reste de la page inerte, mais ne bloque pas
    // toujours le défilement derrière. On le bloque nous-mêmes.
    defilementInitial = document.documentElement.style.overflow
    document.documentElement.style.setProperty('overflow', 'hidden', 'important')

    if (typeof dialogue.showModal === 'function') {
      // La top layer : au-dessus de tout, quels que soient les z-index, ET
      // avec la zone visible pour repère même si un parent porte un transform.
      // C'est ce seul mécanisme qui règle les deux pièges de la page hostile.
      dialogue.showModal()
    } else {
      // Navigateur sans <dialog> modal : on retombe sur un z-index maximal,
      // et c'est le seul cas où on peut perdre contre la page hôte.
      dialogue.show()
      poserStyles(dialogue, { 'z-index': '2147483647' })
    }
  }

  function refermer() {
    if (!dialogue || !pleinEcran) return

    pleinEcran = false

    if (dialogue.open) dialogue.close()

    appliquerModeBouton()
    dialogue.show()

    document.documentElement.style.overflow = defilementInitial

    // Le widget n'a aucun moyen de savoir que la page hôte vient de le
    // refermer : il faut le lui dire pour qu'il revienne à son bouton.
    envoyerAuWidget('closed')
  }

  // --- 5. Le lien de secours -----------------------------------------------

  // Pourquoi une poignée de main positive plutôt qu'une détection d'erreur :
  // une iframe d'une autre origine ne dit pas fiablement qu'elle a échoué.
  // Avec une politique de sécurité qui la bloque, onload peut même se
  // déclencher normalement, et on ne peut pas lire son contenu.
  // Donc on ne détecte pas l'échec, on détecte l'absence de succès.
  function afficherLien() {
    if (lien || !conteneur) return

    lien = document.createElement('a')

    lien.setAttribute('href', LIEN_SECOURS)
    lien.setAttribute('target', '_blank')
    lien.setAttribute('rel', 'noopener noreferrer')
    lien.textContent = 'Réserver un atelier sur daisy.example'

    // Ce lien est le seul morceau de notre interface qui vit dans la page de
    // l'artisan, donc le seul exposé à son CSS. D'où le !important partout,
    // y compris sur la police et la décoration de texte.
    poserStyles(lien, {
      display: 'block',
      margin: '8px 0 0',
      padding: '14px 16px',
      border: '0',
      'border-radius': '8px',
      'background-color': '#c4643a',
      color: '#ffffff',
      font: '500 15px/1.4 system-ui, -apple-system, sans-serif',
      'text-align': 'center',
      'text-decoration': 'none',
      'text-transform': 'none',
      'letter-spacing': 'normal'
    })

    conteneur.appendChild(lien)
  }

  function retirerLien() {
    if (!lien) return

    if (lien.parentNode) lien.parentNode.removeChild(lien)

    lien = null
  }

  // --- Démarrage -----------------------------------------------------------

  function demarrer() {
    conteneur = document.getElementById('daisy-booking')

    // Pas d'emplacement : on ne fait rien du tout, sans bruit.
    if (!conteneur) return

    var cle = conteneur.getAttribute('data-studio')

    if (!cle) return

    // Le conteneur appartient à l'artisan, mais il nous est dédié.
    // On neutralise la seule propriété qui ajouterait de l'espace autour
    // de l'iframe (certains thèmes mettent line-height: 3 sur tous les div).
    poserStyles(conteneur, { 'line-height': 'normal' })

    // Ordre important : on assemble hors du document, puis on insère une
    // seule fois. L'iframe n'entre donc dans la page qu'une fois, et n'en
    // ressortira jamais.
    dialogue = document.createElement('dialog')
    iframe = creerIframe(cle)

    dialogue.appendChild(iframe)
    conteneur.appendChild(dialogue)

    appliquerModeBouton()
    dialogue.show()

    // 'cancel' ne se déclenche que sur Échap, jamais sur nos propres close().
    // On l'intercepte pour refermer proprement nous-mêmes.
    dialogue.addEventListener('cancel', function (evenement) {
      evenement.preventDefault()
      refermer()
    })

    window.addEventListener('message', surMessage)

    minuteur = setTimeout(function () {
      minuteur = null

      if (!pret) afficherLien()
    }, DELAI_SECOURS)
  }

  // --- 6. Ne jamais casser la page de l'artisan ----------------------------

  function amorcer() {
    try {
      demarrer()
    } catch (erreur) {
      // On ne laisse rien remonter dans la page hôte. Et on laisse quand même
      // un chemin de réservation à l'utilisateur.
      try {
        afficherLien()
      } catch (ignoree) {}
    }
  }

  // Le snippet place le script après le div, mais un artisan peut l'avoir
  // collé dans le <head>. Dans ce cas le div n'existe pas encore.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', amorcer)
  } else {
    amorcer()
  }
})()
