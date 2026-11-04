# Context
Chaque application de l'Etat envoie aujourd'hui des notifications. Le besoin pricinpal est de centraliser dans une seule application les envoie de notification. Les notifications sont de type SMS. Ici nous allons construire une paserelle fiable et scalable succeptible de gerer 16M (plus de 15 millions d'habitants au Bénin) SMS par jours.

# Donnée Metier
- Chaque application est authentifier par un code et une api key.
- Chaque application à uu quota journalier expirmé en segments.Pour l'exercice on declarer deux pour les tests ETATCIVIL (100 segments) COURRIER (5 segments).
- Si le text ne contient que des caractère ASCII, un segment compte 160 caractères. Sinon (lètres accentuées, emojis, etc ...) un segment compte 70 caractères. Nombre de segments = nombre de caractères / nombre de caractères par segment, arrondi à l'entier supérieur. Un SMS compte au plus 6 segments.
- Au Bénin nous avons 03 operateurs (MTN, MOOV et CELTIIS). Le routage de l'sms sur le bon operateur se fait par le préfixe du numéro de téléphone. Au bénin chaque numero est préfixé de 01. Il faut suivre cette règle pour simplifier l'exercice CELTIIS (40 à 49), MTN (50, 69) et MOOV (90, 99) sinon l'operateur n'est pas reconnu.
- Les SMS sont soit de type OTP (code à usage unique, prioritaire) soit une information (message d'information)
- Les provider (MTN, MOOV et CELTIIS) doit être simulé dans le code, ici on se concentre sur la gateaway
- Les SMS sont envoyés en masse, il faut donc un systeme de file d'attente pour gérer les envois
- On doit pouvoir simuler les cas d'erreur (ECHEC_TEMPORAIRE, ECHEC_DEFINITIF, ECHEC_OPERATEUR)
- Soumettre un sms : destinataire, text, categorie, reference (optionnel), date d'envoie(envoie programmé, optionel). La reponse indique l'id sms, nombre de segment et le status
- pour une campagne, un sms de categorie INFO envoyé à 500 destinataires au plus.
- pour chaque SMS une notification est envoyée au client via webhook avec signature HMAC
- l'application doit pouvoir consulter le statut des SMS envoyés et de ses campagne et sa consommation journalière et pouvoir cancel un message en attente ou retry un message en échec.
- Il faut gerer le RBAC et ABAC pour les differentes ressources, la sécurité, le rate limiting et la surveillance.
- Il faut valider les numeros (10 caractères commençant par 01)
- Le quota est renitialisé chaque jour à minuit (GMT+1).
- Les sms de categorie INFO ne partent que entre 07h et 21h (GMT+1) en dehors de cette plage ils sont envoyé à 07h du lendemain. Les SMS de type OTP passent sont prioritaires et sont envoyés immédiatement et passe avant les INFO qui sont en attente
- Il faut gerer l'idempotense pour eviter les doublons.
- un echec temporaire ou l'operateur indsponiible entraine au plus 3 retry avec un delay exponentiel après ça le message passe en echec
- Seule les messages rendu avec la bonne signature sont accepté
- un message est en status pending -> transmitted-> delivered | failed
- seul un message en status pending peut etre cancel
- les otp ne sont jamais dans les logs, ni dans les reponses, null part
- une action interdite ou une erreur est claire avec le bon status code HTTP reponse {code, message} en anglais
- proposer un tableau de bord admin pour suivre l'activité des applications et des sms (volume par application, par operateur, et par status)
- Ecrire des tests unitaires et d'integration
- Proposer un README.me claire et non toufu qui esplique au recruteur comment lancer le projet, les tests, les endpoints, les features implementées
