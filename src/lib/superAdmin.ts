// Qui administre Henri — une donnée, pas une constante.
//
// L'identifiant de l'administrateur était recopié en dur dans cinq fichiers.
// Deux conséquences, et la seconde est la plus gênante :
//
// - **changer d'administrateur demandait un déploiement**, ce qui revient à
//   dire qu'on ne change pas d'administrateur ;
// - le compte qui tient l'étude et le compte qui administre l'outil étaient
//   forcément **le même**. Or ce sont deux métiers : l'un ouvre des dossiers
//   toute la journée, l'autre peut lire ceux de tout le monde. Les tenir
//   séparés, c'est n'exposer le second qu'au moment où l'on s'en sert.
//
// La liste vit donc dans Firestore, collection `superAdmins`, **là où les
// règles de sécurité la lisaient déjà** (`isSuperAdmin()`) : un document par
// administrateur, l'identifiant du compte pour nom, rien dedans. Nommer un
// administrateur, c'est créer ce document ; le révoquer, c'est l'effacer.
// Personne ne peut se nommer lui-même : les règles interdisent l'écriture,
// seule la console (ou le SDK admin) y touche.
//
// L'application lit cette liste des deux côtés — l'écran d'administration côté
// navigateur, les routes d'API côté serveur — et les deux se rejoignent sur la
// même vérité.

/**
 * Rien n'est reconnu sans document.
 *
 * Le compte historique l'était, le temps de basculer vers un compte
 * d'administration dédié sans risquer de se verrouiller dehors. La bascule
 * faite, ce filet est retiré : **la collection `superAdmins` est désormais la
 * seule réponse à la question « qui administre Henri ? »**, côté serveur comme
 * côté navigateur comme dans les règles de sécurité.
 *
 * Nommer un administrateur — se renommer soi-même compris — se fait donc en
 * créant un document dans cette collection, depuis la console. Il n'y a plus
 * rien à déployer pour cela, et plus aucun identifiant dans le code.
 */
