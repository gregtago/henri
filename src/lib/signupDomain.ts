// Qui peut s'inscrire : les adresses du notariat.
//
// Henri s'ouvre, mais pas à tout le monde — c'est un outil de dossiers
// notariaux, et le domaine `notaires.fr` (et ses sous-domaines départementaux :
// `paris.notaires.fr`, `nancy.notaires.fr`…) est précisément ce qui distingue
// une adresse professionnelle du notariat d'une adresse quelconque.
//
// La règle est **vérifiée côté serveur** et nulle part ailleurs : la même règle
// écrite dans un écran n'est qu'un affichage, et un formulaire se contourne en
// trois clics dans une console de navigateur.
//
// Elle ne prouve pas l'identité, seulement l'appartenance au domaine — et c'est
// le lien envoyé à cette adresse qui prouve qu'elle appartient bien à celui qui
// s'inscrit. Domaine reconnu, courriel reçu : les deux, ou rien.

/** Le domaine du notariat, sous-domaines compris. */
export const SIGNUP_DOMAIN = "notaires.fr";

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** L'adresse a-t-elle une forme d'adresse ? */
export const looksLikeEmail = (email: string): boolean => EMAIL_SHAPE.test(email.trim());

/**
 * Cette adresse ouvre-t-elle droit à l'inscription ?
 *
 * `x@notaires.fr` comme `x@paris.notaires.fr` — mais pas
 * `x@faux-notaires.fr`, dont le domaine se *termine* par la même chaîne sans
 * être un sous-domaine (d'où le point exigé devant).
 */
export const isEligibleSignupEmail = (email: string): boolean => {
  const value = email.trim().toLowerCase();
  if (!looksLikeEmail(value)) return false;
  const domain = value.slice(value.lastIndexOf("@") + 1);
  return domain === SIGNUP_DOMAIN || domain.endsWith(`.${SIGNUP_DOMAIN}`);
};
