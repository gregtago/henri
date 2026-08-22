// Le second facteur : l'inscrire, s'en servir pour entrer, le retirer.
//
// La politique (qui doit s'équiper, et pour quand) vit dans `mfaPolicy.ts` et
// ne change pas ici. Ce fichier ne s'occupe que du geste : poser un code à six
// chiffres sur son compte, et le présenter à la connexion.
//
// Le mécanisme est celui de toutes les applications d'authentification (Google
// Authenticator, Microsoft Authenticator, 1Password, Bitwarden…) : le compte et
// le téléphone partagent une clé, chacun en tire le même code toutes les trente
// secondes. La clé ne voyage qu'une fois, à l'inscription ; ensuite plus rien ne
// transite, ce qui est précisément l'intérêt — un code lu sur un téléphone ne
// se pêche pas dans une boîte aux lettres.
//
// **Deux règles héritées du fournisseur, et qui expliquent l'écran.**
// L'adresse doit être vérifiée avant d'inscrire un facteur : sans quoi il
// suffirait de s'inscrire avec l'adresse d'un autre pour l'enfermer dehors
// avec son propre téléphone. Et retirer un facteur demande une connexion
// récente : on ne désarme pas une serrure avec une session laissée ouverte.
//
// Rien de tout cela ne remonte tel quel à l'écran : `mfaMessage` traduit les
// codes d'erreur en phrases, parce qu'un notaire n'a pas à lire un code
// d'erreur pour comprendre qu'il a tapé le mauvais chiffre.

import {
  EmailAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
  TotpMultiFactorGenerator,
  type Auth,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";

/** Le nom sous lequel Henri s'annonce dans l'application d'authentification. */
const ISSUER = "Henri";

/** Les facteurs déjà inscrits sur ce compte. */
export const enrolledFactors = (user: User | null): MultiFactorInfo[] =>
  user ? multiFactor(user).enrolledFactors : [];

/** Ce compte présente-t-il déjà un second facteur ? */
export const hasSecondFactor = (user: User | null): boolean =>
  enrolledFactors(user).length > 0;

/**
 * Ouvre une inscription : le compte fabrique une clé, qu'il faut maintenant
 * confier à une application d'authentification.
 *
 * Rien n'est encore inscrit à ce stade — tant que le code n'a pas été
 * confirmé, le compte n'a pas changé. Renoncer ici ne laisse aucune trace.
 */
export const startTotpEnrollment = async (user: User): Promise<TotpSecret> => {
  const session = await multiFactor(user).getSession();
  return TotpMultiFactorGenerator.generateSecret(session);
};

/**
 * Confirme l'inscription avec le premier code lu dans l'application.
 *
 * Le code prouve que la clé est bien arrivée à destination : sans cette
 * preuve, on inscrirait un facteur que personne ne sait produire, et le compte
 * serait perdu à la prochaine connexion.
 */
export const confirmTotpEnrollment = async (
  user: User,
  secret: TotpSecret,
  code: string,
  label: string
): Promise<void> => {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
  await multiFactor(user).enroll(assertion, label);
};

/**
 * Identity Platform a refusé faute de connexion récente.
 *
 * Poser une serrure sur un compte est une opération sensible : le fournisseur
 * exige que le mot de passe ait été présenté il y a peu, et non qu'une session
 * ouverte le matin serve encore le soir. C'est le refus qui donnait
 * l'impression que « la double authentification ne s'installe pas » : le
 * bouton répondait une phrase, et la phrase demandait de se déconnecter.
 */
export const needsRecentLogin = (error: unknown): boolean =>
  errorCode(error) === "auth/requires-recent-login";

/**
 * Re-présenter le mot de passe, sans quitter l'écran.
 *
 * Se déconnecter puis se reconnecter faisait la même chose, en perdant la
 * clé en cours d'inscription et le fil de ce qu'on était en train de faire.
 */
export const reauthenticateWithPassword = async (user: User, password: string): Promise<void> => {
  if (!user.email) throw new Error("no-email");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
};

/** Retire un facteur inscrit. Demande une connexion récente. */
export const removeSecondFactor = async (user: User, factorUid: string): Promise<void> => {
  await multiFactor(user).unenroll(factorUid);
};

/**
 * L'adresse à afficher dans l'application d'authentification, et le lien qui
 * l'y installe d'un geste.
 *
 * Sur un téléphone, toucher ce lien ouvre l'application d'authentification et
 * y range le compte : pas de clé à recopier. Sur un ordinateur il ne mène nulle
 * part — d'où la clé, affichée à côté, à saisir à la main.
 */
export const totpLink = (secret: TotpSecret, email: string | null): string =>
  secret.generateQrCodeUrl(email ?? ISSUER, ISSUER);

/**
 * La clé en groupes de quatre.
 *
 * Trente-deux lettres d'affilée se recopient mal ; en groupes, l'œil retrouve
 * sa place après avoir regardé le clavier.
 */
export const formatSecretKey = (secretKey: string): string =>
  (secretKey.match(/.{1,4}/g) ?? [secretKey]).join(" ");

// ── La connexion, quand un second facteur est inscrit ────────────────────────

/**
 * Cette erreur de connexion n'en est pas une : le mot de passe était bon, il
 * manque le code.
 */
export const needsSecondFactor = (error: unknown): error is MultiFactorError =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "auth/multi-factor-auth-required";

/** De quoi terminer la connexion : la liste des facteurs, et le moyen d'y répondre. */
export const secondFactorResolver = (auth: Auth, error: MultiFactorError): MultiFactorResolver =>
  getMultiFactorResolver(auth, error);

/**
 * Termine la connexion avec le code à six chiffres.
 *
 * Henri n'inscrit que des codes à six chiffres : s'il n'y a rien de tel parmi
 * les facteurs du compte, mieux vaut le dire que laisser tourner.
 */
export const completeSignInWithCode = async (
  resolver: MultiFactorResolver,
  code: string
): Promise<void> => {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("no-totp-factor");
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
  await resolver.resolveSignIn(assertion);
};

// ── Ce que l'écran affiche quand quelque chose ne passe pas ──────────────────

/** Le code d'erreur Firebase, ou la chaîne vide si l'objet n'en porte pas. */
const errorCode = (error: unknown): string =>
  (typeof error === "object" && error !== null ? (error as { code?: string }).code : "") ?? "";

/**
 * Une phrase, jamais un code d'erreur.
 *
 * Chaque cas dit ce qu'il faut faire ensuite : un message qui ne débloque
 * personne ne vaut pas mieux que pas de message du tout.
 */
export const mfaMessage = (error: unknown): string => {
  switch (errorCode(error)) {
    case "auth/invalid-verification-code":
    case "auth/invalid-verification-id":
    case "auth/missing-verification-code":
      return "Ce code n'est pas le bon. Il change toutes les 30 secondes : reprenez celui affiché à l'instant.";
    case "auth/code-expired":
      return "Ce code a expiré. Reprenez celui affiché à l'instant.";
    case "auth/unverified-email":
      return "Confirmez d'abord votre adresse, juste au-dessus.";
    case "auth/requires-recent-login":
      return "Par sécurité, cette opération demande une connexion récente. Retapez votre mot de passe ci-dessous.";
    case "auth/second-factor-already-in-use":
      return "Cette application d'authentification est déjà inscrite sur votre compte.";
    case "auth/maximum-second-factor-count-exceeded":
      return "Vous avez déjà inscrit le nombre maximum d'applications d'authentification.";
    case "auth/too-many-requests":
      return "Trop d'essais de suite. Attendez quelques minutes avant de recommencer.";
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
    case "auth/unsupported-first-factor":
      // Ce n'est pas le compte qui est en cause : le second facteur n'est pas
      // ouvert sur le projet lui-même. Rien de ce que fera le lecteur n'y
      // changera quoi que ce soit — autant le lui dire, et lui dire à qui en
      // parler, plutôt que de le laisser réessayer indéfiniment.
      return "La double authentification n'est pas activée côté serveur. Signalez-le à l'Office : le réglage se pose une fois, pour tout le monde.";
    case "auth/network-request-failed":
      return "La connexion au serveur a échoué. Vérifiez votre réseau, puis recommencez.";
    default:
      return "L'opération n'a pas abouti. Réessayez dans un instant.";
  }
};

/**
 * Le code d'erreur brut, à afficher en tout petit sous la phrase.
 *
 * Une phrase suffit à celui qui peut agir ; elle ne suffit pas à celui qu'on
 * appelle au secours. Le code dit en quatre mots ce qu'aucune reformulation ne
 * dira — et c'est lui, pas la phrase, qui permet de trancher entre « le
 * réglage n'est pas ouvert sur le projet » et « ce compte a mal tapé ».
 */
export const mfaErrorCode = (error: unknown): string | null => errorCode(error) || null;
