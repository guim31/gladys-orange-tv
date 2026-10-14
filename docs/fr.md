# Orange TV

Pilotez et suivez votre **décodeur TV d'Orange** (UHD 86, TV 4, TV 5, TV 6) depuis Gladys, sur votre
réseau local : allumez-le ou mettez-le en veille, voyez la chaîne affichée, changez de chaîne, montez ou
baissez le volume, et réagissez dans vos scènes quand la TV s'allume ou que la chaîne change.

L'intégration utilise l'API HTTP locale du décodeur (port 8080), celle de l'application mobile TV
d'Orange. Pas de compte, pas de cloud.

> **Développée sans le matériel : vos retours sont les bienvenus.** L'intégration a été construite et
> testée contre un simulateur fidèle aux réponses publiées par les projets open source qui utilisent
> cette API, pas contre un vrai décodeur. Dites-nous ce qui marche et ce qui ne marche pas sur
> [GitHub](https://github.com/guim31/gladys-orange-tv/issues) ou sur le forum Gladys.

## Prérequis

- Un décodeur TV d'Orange relié à votre Livebox, sur le même réseau que Gladys.
- Son adresse IP : dans l'interface de la Livebox (`http://192.168.1.1`), parmi les appareils connectés.
  Réservez-la (bail DHCP statique) pour qu'elle ne change pas.
- Gladys 5.1.0 ou plus récent.

## Configuration

Dans **Intégrations → Orange TV → Configuration** :

- **Adresse IP** : l'adresse du décodeur, ex. `192.168.1.20` (port 8080 par défaut ; tapez
  `192.168.1.20:8081` pour un autre).
- **Nom** : le nom de l'appareil dans Gladys. Vide : « Orange TV » suivi de l'adresse.
- Jusqu'à trois décodeurs, un par section.
- **Intervalle de lecture** : fréquence de lecture des décodeurs, de 5 secondes à 1 minute (10 secondes
  par défaut). C'est le délai avant que Gladys voie un changement de chaîne fait à la télécommande.
- **Langue des noms** : langue des noms de fonctionnalités et des textes envoyés par l'intégration.
  Choisissez-la avant d'ajouter les appareils : Gladys garde les noms donnés à la création.

**Tester les décodeurs** lit chaque décodeur et dit ce qu'il affiche. Ajoutez ensuite les appareils
depuis l'onglet **Découverte**.

## Appareils

Un appareil par décodeur, avec ces fonctionnalités :

| Fonctionnalité        | Ce qu'elle fait                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Marche / veille**   | Allumé (1) ou en veille (0). Un décodeur qui ne répond plus compte comme éteint. Modifiable : allume ou éteint le décodeur. |
| **Numéro de chaîne**  | Numéro de la chaîne en direct sur la télécommande, 0 s'il n'y en a pas. Modifiable : tape le numéro sur la télécommande.    |
| **Chaîne**            | Nom de la chaîne, ou ce qu'affiche le décodeur : _Page d'accueil_, _Vidéo à la demande_, _En veille_, _Éteint_.             |
| **Chaîne suivante**   | Bouton : chaîne suivante.                                                                                                   |
| **Chaîne précédente** | Bouton : chaîne précédente.                                                                                                 |
| **Monter le volume**  | Bouton : un cran de volume en plus.                                                                                         |
| **Baisser le volume** | Bouton : un cran de volume en moins.                                                                                        |
| **Muet**              | Bouton : couper ou remettre le son.                                                                                         |
| **Lecture / pause**   | Bouton : mettre en pause le direct ou un replay, puis reprendre.                                                            |

La touche marche de la télécommande est une bascule : l'intégration lit d'abord le décodeur et n'appuie
que si besoin, donc « éteindre » n'allume jamais un décodeur.

Les noms des chaînes viennent d'une table de l'offre Orange embarquée dans l'intégration (chaînes de la
TNT, les principales jusqu'à 40). Une chaîne absente s'affiche `EPG <id>` (son identifiant dans le guide
Orange), avec le numéro 0.

## Widgets

### Télécommande

L'état du décodeur et la chaîne affichée, avec quatre boutons : **Allumer** (ou **Mettre en veille**
quand il est allumé), puis soit **Chaîne −**, **Chaîne +** et **Muet** (par défaut), soit **Volume −**,
**Volume +** et **Muet** (réglage _Boutons_). Gladys permet quatre boutons par widget : placez deux
widgets Télécommande côte à côte pour la télécommande complète.

### Chaînes favorites

Quatre boutons de chaînes, numéros choisis dans les réglages du widget (TF1, France 2, France 3 et M6
par défaut). La chaîne affichée porte une coche. Un appui sur un décodeur en veille l'allume d'abord,
puis tape le numéro.

## Déclencheurs de scène

- **Décodeur allumé** : le décodeur est sorti de veille. Informations transmises : nom du décodeur,
  numéro de chaîne, chaîne.
- **Décodeur éteint** : le décodeur s'est mis en veille, ou ne répond plus (filtre _Comment_).
  Informations transmises : nom du décodeur, comment (`standby` ou `unreachable`).
- **Chaîne changée** : le décodeur est passé sur une autre chaîne en direct (filtre sur un numéro de
  chaîne, vide : n'importe laquelle). Informations transmises : nom du décodeur, numéro et nom de la
  chaîne, numéro et nom de la chaîne précédente. Passer par la page d'accueil et revenir sur la même
  chaîne n'est pas un changement.

Les événements partent même pour un décodeur non ajouté dans Gladys.

## Actions de scène

- **Allumer ou éteindre le décodeur** : n'appuie sur la touche marche que si besoin. Sortie : si la
  touche a été appuyée.
- **Mettre une chaîne** : tape le numéro de la chaîne sur la télécommande ; allume d'abord le décodeur
  s'il est en veille (environ 6 secondes). Sorties : numéro et nom de la chaîne.
- **Appuyer sur une touche** : OK, retour, menu, guide TV, flèches, chaînes, volume, muet, lecture /
  pause, retour rapide, avance rapide, enregistrer, vidéo à la demande, marche ; jusqu'à 10 fois (crans
  de volume).

Sans décodeur choisi, les actions pilotent le premier décodeur de la configuration.

## Exemples de scènes

- **Info du matin** : à 7 h en semaine → _Mettre une chaîne_ 16 (franceinfo).
- **Soirée film** : _Décodeur allumé_ après 20 h → tamiser les lumières du salon.
- **Maison calme** : _Décodeur éteint_ → couper la multiprise de la TV au bout de 5 minutes.
- **Enfants** : _Chaîne changée_ vers un numéro donné → envoyer un message.

## Dépannage

- **« ne répond pas (éteint, ou mauvaise adresse) »** : vérifiez l'adresse IP dans la Livebox ; le
  décodeur doit être sous tension. En veille profonde (le mode économie d'énergie du décodeur), il ne
  répond plus sur le réseau : il s'affiche alors _Éteint_ et ne se rallume qu'avec sa télécommande.
- **« répond, mais n'est pas un décodeur TV d'Orange »** : l'adresse est celle d'un autre appareil.
- **La chaîne s'affiche `EPG 1234`** : la chaîne n'est pas dans la table embarquée ; donnez-nous son
  numéro et son nom dans une issue.
- **Une chaîne tapée est fausse** : les chiffres sont tapés à 0,35 s d'intervalle ; dites-nous si votre
  décodeur a besoin de plus.
- Journaux : **Intégrations → Orange TV → Logs** ; `LOG_LEVEL=debug` pour voir chaque lecture.

## Limites

- Développée sans le matériel : la lecture de la veille, de la page d'accueil et des applications vient
  des projets open source, pas de tests sur un vrai décodeur. La « Clé TV » d'Orange (Android TV) n'a
  probablement pas cette API locale : non prise en charge tant que personne ne confirme le contraire.
- Pas de guide des programmes : le décodeur ne donne que l'identifiant de la chaîne affichée, et
  l'intégration n'appelle aucun service en ligne d'Orange.
- Un décodeur en veille profonde ne peut pas être réveillé par le réseau.
- Pas de découverte : l'adresse IP se saisit dans la configuration.
- L'API locale n'a pas de mot de passe : toute personne sur votre réseau peut piloter le décodeur, avec
  ou sans Gladys. L'intégration n'envoie que des touches de la télécommande.
- Sans lien avec Orange. Orange est une marque d'Orange SA.
