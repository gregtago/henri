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
 * Le compte administrateur historique, reconnu sans document.
 *
 * Un filet de sécurité, pas une exception permanente : il évite de se
 * verrouiller dehors le jour où l'on bascule vers un compte dédié. Une fois le
 * nouveau compte inscrit dans `superAdmins` et vérifié, cette constante n'a
 * plus de raison d'être — la supprimer ici la retire partout.
 */
export const LEGACY_SUPER_ADMIN_UID = "ByHcIefOjWVdQBcikq5oZtJGGZA2";
