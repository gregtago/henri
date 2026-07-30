// Barème de délais notariaux.
//
// C'est le socle de la vue Calendrier : sans lui, un calendrier ne sait afficher
// que des points (« telle tâche échoit le 12 »). Avec lui, Henri sait afficher
// des *durées* — le temps d'attente d'une pièce — et surtout des *dates de
// lancement* : « pour tenir le 30 septembre, cette demande doit partir le 31 août ».
//
// Les valeurs sont des délais aller-retour observés en jours calendaires,
// volontairement prudents (on préfère lancer trop tôt que trop tard). Elles sont
// éditables tâche par tâche depuis la vue Calendrier : le barème n'est qu'un
// défaut intelligent, jamais une vérité.

export type DelaiRule = {
  key: string;
  label: string;   // libellé affiché quand Henri explique son calcul
  days: number;    // délai aller-retour, en jours calendaires
  test: RegExp;
};

export const DEFAULT_DELAI_DAYS = 15;

// L'ordre compte : la première règle qui matche gagne. On place donc les
// libellés les plus spécifiques avant les plus génériques.
export const DELAI_RULES: DelaiRule[] = [
  { key: "dia",          label: "DIA / préemption",        days: 60, test: /\b(dia|preempt|declaration d'intention|declaration dintention|safer)\b/ },
  { key: "etat-date",    label: "État daté",               days: 30, test: /(etat date|pre-?etat date|etat dat)/ },
  { key: "urbanisme",    label: "Urbanisme (mairie)",      days: 30, test: /(urbanisme|note de renseignement|certificat d'urbanisme|certificat durbanisme|alignement|voirie|assainissement|permis de construire)/ },
  { key: "cadastre",     label: "Géomètre / cadastre",     days: 30, test: /(geometre|arpentage|cadastr|bornage|document modificatif)/ },
  { key: "hypotheque",   label: "Service de la publicité foncière", days: 21, test: /(hypothecaire|hypotheque|publicite fonciere|fichier immobilier|releve de formalite|etat sur formalite|anf)/ },
  { key: "syndic",       label: "Syndic de copropriété",   days: 21, test: /(syndic|copropriete|carnet d'entretien|carnet dentretien|proces-verbal d'ag|pv d'ag|pv dag|assemblee generale|fonds de roulement|pre-?etat)/ },
  { key: "fiscal",       label: "Administration fiscale",  days: 21, test: /(fisc|impot|tresor|sie |avis d'imposition|avis dimposition|taxe fonciere)/ },
  { key: "confrere",     label: "Confrère",                days: 15, test: /(confrere|notaire adverse|office de|etude de me|maitre )/ },
  { key: "banque",       label: "Banque",                  days: 15, test: /(banque|pret|credit|mainlevee|decompte|domiciliation|caution|crd|remboursement anticipe)/ },
  { key: "assurance",    label: "Assurance",               days: 15, test: /(assurance|dommages-?ouvrage|do |decennale|sinistre)/ },
  { key: "etat-civil",   label: "État civil",              days: 10, test: /(etat civil|acte de naissance|acte de mariage|acte de deces|livret de famille|extrait de naissance)/ },
  { key: "client",       label: "Pièces client",           days: 10, test: /(vendeur|acquereur|client|piece d'identite|piece didentite|rib|justificatif de domicile|questionnaire)/ },
  { key: "diagnostics",  label: "Diagnostics",             days: 7,  test: /(diagnostic|dpe|amiante|plomb|termite|erp|electricite|gaz|carrez|loi carrez)/ },
];

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type DelaiInfo = {
  days: number;
  label: string;
  key: string;
  /**
   * D'où vient le chiffre — Henri doit toujours pouvoir le dire :
   *  • `manual`  : fixé à la main sur la tâche, il fait autorité ;
   *  • `rule`    : reconnu dans le libellé (« état daté » → 30 j) ;
   *  • `default` : rien de reconnu, on applique le délai standard.
   */
  source: "manual" | "rule" | "default";
};

/** Devine le délai d'attente d'une pièce à partir de son libellé. */
export const inferDelai = (title: string): DelaiInfo => {
  const normalized = stripAccents(title ?? "");
  for (const rule of DELAI_RULES) {
    if (rule.test.test(normalized)) {
      return { days: rule.days, label: rule.label, key: rule.key, source: "rule" };
    }
  }
  return { days: DEFAULT_DELAI_DAYS, label: "Délai standard", key: "default", source: "default" };
};

/**
 * Délai effectif d'une tâche : ce que l'utilisateur a fixé l'emporte toujours
 * sur l'estimation. On garde le libellé de la règle reconnue, il reste utile
 * pour expliquer d'où venait la proposition initiale.
 */
export const resolveDelai = (task: { title: string; delaiDays?: number | null }): DelaiInfo => {
  const guessed = inferDelai(task.title);
  if (typeof task.delaiDays === "number" && task.delaiDays > 0) {
    return { ...guessed, days: task.delaiDays, source: "manual" };
  }
  return guessed;
};

// ── Jours ouvrés ──────────────────────────────────────────────────────────
// On ne gère volontairement pas les jours fériés : un décalage d'un jour sur
// une estimation à trois semaines n'apporte rien, et la liste des fériés est
// une dette de maintenance. Samedi et dimanche suffisent.

export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
};

/** Ramène une date sur le jour ouvré suivant (pour une arrivée). */
export const rollForward = (date: Date) => {
  let next = new Date(date);
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
};

/** Ramène une date sur le jour ouvré précédent (pour un envoi). */
export const rollBack = (date: Date) => {
  let prev = new Date(date);
  while (isWeekend(prev)) prev = addDays(prev, -1);
  return prev;
};

/** Date de retour attendue d'une pièce demandée le `requestedAt`. */
export const expectedReturnDate = (requestedAt: Date, days: number) =>
  rollForward(addDays(requestedAt, days));

/**
 * Date de lancement au plus tard : le dernier jour où l'on peut envoyer la
 * demande en espérant encore la recevoir avant l'échéance. C'est le calcul le
 * plus utile de toute la vue — celui qu'aucun agenda ne fait.
 */
export const latestLaunchDate = (dueDate: Date, days: number) =>
  rollBack(addDays(dueDate, -days));
