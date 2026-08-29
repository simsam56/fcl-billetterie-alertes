# Surveillance des mises en vente FC Lorient

## Objectif

Détecter automatiquement toute nouvelle mise en vente d'un match publiée sur la billetterie officielle du FC Lorient et envoyer une notification ntfy contenant un lien direct vers l'achat. La surveillance doit fonctionner lorsque les appareils de Simon sont éteints et ne doit envoyer qu'une alerte par nouvelle vente.

## Périmètre

Le service surveille les matchs à domicile et à l'extérieur qui apparaissent sur la page officielle `https://billetterie.fclorient.bzh/fr/matchs/billets-packs`. Une vente est reconnue par l'apparition d'un lien de catalogue de match sous `/fr/catalogue/match-foot-masculin-...`.

Le service ne réserve ni n'achète de billet, ne se connecte pas au compte FCL, ne contourne aucune file d'attente et ne surveille pas les plateformes de revente non officielles. Les packs, abonnements et produits sans match individuel sont hors périmètre.

## Hébergement

Le code sera publié dans un dépôt GitHub public nommé `fcl-billetterie-alertes`. Un workflow GitHub Actions sera programmé toutes les cinq minutes et pourra aussi être lancé manuellement. Le canal ntfy ne figurera jamais dans le dépôt : il sera enregistré dans le secret GitHub `NTFY_TOPIC`.

GitHub ne garantit pas un déclenchement à la seconde près. Une alerte peut donc arriver après plus de cinq minutes si la plateforme retarde une exécution. L'alerte officielle du FCL reste une sécurité complémentaire.

## Détection et état persistant

Le programme télécharge la page officielle avec un délai maximal explicite et refuse les réponses HTTP en erreur. Il extrait et normalise les liens de vente de matchs, puis les déduplique.

Une branche dédiée `state` contient un petit fichier JSON avec les liens déjà signalés. Le premier lancement constitue la référence : les ventes déjà ouvertes sont enregistrées sans notification. Lors des lancements suivants, seuls les liens absents de cette référence sont considérés comme nouveaux.

Chaque notification envoyée avec succès ajoute immédiatement le lien correspondant à l'état qui sera poussé sur la branche `state`. Une notification échouée n'est pas marquée comme envoyée et sera retentée au contrôle suivant. Une règle de concurrence GitHub empêche deux contrôles de modifier l'état simultanément.

## Notification

Pour chaque nouvelle vente, le programme envoie une requête HTTPS à ntfy avec :

- le titre `Billetterie FC Lorient ouverte` ;
- un libellé lisible dérivé de l'adresse du match ;
- une priorité haute ;
- le lien direct de la vente comme action d'ouverture.

Une commande de test distincte permet de vérifier le trajet GitHub Actions vers ntfy sans créer de faux match et sans modifier l'état des ventes.

## Gestion des erreurs

Une indisponibilité de la billetterie, un délai dépassé, une réponse HTTP invalide ou l'absence de la signature attendue de la page fait échouer clairement l'exécution sans modifier l'état. Une erreur ntfy laisse la vente non signalée afin que le contrôle suivant réessaie.

Les journaux ne doivent afficher ni le contenu du secret `NTFY_TOPIC`, ni une URL ntfy contenant ce secret. Les erreurs doivent rester suffisamment précises pour diagnostiquer la billetterie, l'extraction, l'état Git ou ntfy.

## Tests et vérification

Le développement suit une démarche test-first. Les tests unitaires couvrent au minimum :

- l'extraction de plusieurs liens de match et leur déduplication ;
- l'ignorance des packs et autres produits ;
- la transformation d'un lien en libellé lisible ;
- le premier lancement sans notification ;
- la détection d'une nouvelle vente ;
- l'absence de doublon lors d'un second contrôle ;
- la conservation d'une vente dont la notification échoue ;
- l'absence du secret dans les journaux.

La vérification finale comprend les tests automatisés, une extraction en lecture seule de la page réelle, un lancement manuel de référence sur GitHub, puis une notification de contrôle GitHub Actions vers le téléphone. Le workflow programmé ne sera considéré actif qu'après validation de ces quatre niveaux.

## Maintenance

Le dépôt contiendra une procédure courte pour consulter les dernières exécutions, relancer manuellement le contrôle, remplacer le canal ntfy et réinitialiser volontairement la référence annuelle. Aucun entretien régulier ne doit être nécessaire tant que la structure des liens de la billetterie reste stable.
