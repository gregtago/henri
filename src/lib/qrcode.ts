// Le carré à photographier — un encodeur QR, ici, dans Henri.
//
// Personne ne recopie trente-deux lettres à la main. L'écran d'inscription du
// second facteur affichait pourtant cela : une clé, et un lien `otpauth://`
// qui, sur un ordinateur, ne mène nulle part — aucun navigateur de bureau ne
// sait quoi faire de ce protocole. Le geste normal, celui que toutes les
// applications d'authentification attendent, c'est de **photographier un
// carré**. Il manquait.
//
// Il est calculé ici plutôt que demandé à un service : une clé TOTP est le
// secret qui garde des dossiers notariaux, et elle n'a rien à faire dans
// l'URL d'une image hébergée ailleurs. Rien ne sort du navigateur.
//
// Mode octet, correction d'erreur M (~15 % de casse tolérée), version choisie
// au plus juste selon la longueur. C'est l'algorithme de la norme
// ISO/IEC 18004 ; la seule liberté prise est de ne pas implémenter les modes
// numérique et alphanumérique, inutiles pour une URL.

/** Nombre de mots de correction par bloc, niveau M, versions 1 à 40. */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];

/** Nombre de blocs de correction, niveau M, versions 1 à 40. */
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

/** Modules disponibles pour les données, motifs fonctionnels déduits. */
const rawDataModules = (ver: number): number => {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
};

const dataCodewords = (ver: number): number =>
  Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

/** Coordonnées des centres des motifs d'alignement. */
const alignPositions = (ver: number): number[] => {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
};

// ── Corps de Galois GF(256), polynôme 0x11D ────────────────────────────────

const gfMul = (a: number, b: number): number => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((b >>> i) & 1) * a;
  }
  return z & 0xff;
};

const rsDivisor = (degree: number): Uint8Array => {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
};

const rsRemainder = (data: Uint8Array, divisor: Uint8Array): Uint8Array => {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
};

// ── Les données, en mots de code ───────────────────────────────────────────

const chooseVersion = (byteLen: number): number => {
  for (let ver = 1; ver <= 40; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + byteLen * 8 <= dataCodewords(ver) * 8) return ver;
  }
  throw new Error("qrcode: contenu trop long");
};

const buildCodewords = (text: string): { ver: number; data: Uint8Array } => {
  const bytes = Array.from(new TextEncoder().encode(text));
  const ver = chooseVersion(bytes.length);

  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // mode octet
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminateur
  push(0, (8 - (bits.length % 8)) % 8); // alignement sur l'octet
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => { data[i >>> 3] |= bit << (7 - (i & 7)); });
  return { ver, data };
};

/** Découpe en blocs, calcule la correction, entrelace le tout. */
const interleave = (ver: number, data: Uint8Array): number[] => {
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks) - eccLen;

  const divisor = rsDivisor(eccLen);
  const blocks: { dat: Uint8Array; ecc: Uint8Array }[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    blocks.push({ dat, ecc: rsRemainder(dat, divisor) });
  }

  const result: number[] = [];
  for (let i = 0; i < shortLen + 1; i++) {
    blocks.forEach((b, j) => {
      // Les blocs courts n'ont pas de dernier octet : on les saute.
      if (i < shortLen || j >= numShort) result.push(b.dat[i]);
    });
  }
  for (let i = 0; i < eccLen; i++) for (const b of blocks) result.push(b.ecc[i]);
  return result;
};

// ── Le masque ──────────────────────────────────────────────────────────────

const maskFn = (mask: number, x: number, y: number): boolean => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
};

const applyMask = (modules: boolean[][], isFunction: boolean[][], mask: number, size: number): void => {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunction[y][x] && maskFn(mask, x, y)) modules[y][x] = !modules[y][x];
    }
  }
};

/** Les quatre pénalités de la norme : le masque retenu est le moins pénalisé. */
const penalty = (m: boolean[][], size: number): number => {
  let result = 0;

  const runs = (get: (a: number, b: number) => boolean) => {
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (get(i, j) === get(i, j - 1)) {
          run++;
          if (run === 5) result += 3;
          else if (run > 5) result++;
        } else run = 1;
      }
    }
  };
  runs((y, x) => m[y][x]);
  runs((x, y) => m[y][x]);

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) result += 3;
    }
  }

  const pattern = [true, false, true, true, true, false, true];
  const looksLikeFinder = (get: (k: number) => boolean, i: number): boolean => {
    const at = (offset: number) => {
      const k = i + offset;
      return k >= 0 && k < size ? get(k) : false;
    };
    if (!pattern.every((p, offset) => at(offset) === p)) return false;
    const before = [-4, -3, -2, -1].every((offset) => !at(offset));
    const after = [7, 8, 9, 10].every((offset) => !at(offset));
    return before || after;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (looksLikeFinder((k) => m[y][k], x)) result += 40;
      if (looksLikeFinder((k) => m[k][x], y)) result += 40;
    }
  }

  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
};

// ── Le code ────────────────────────────────────────────────────────────────

export type QrCode = {
  /** Côté du carré, en modules. */
  size: number;
  /** `modules[y][x]` — vrai quand le module est sombre. */
  modules: boolean[][];
  version: number;
};

/** Encode un texte. Lève si le contenu dépasse la version 40. */
export const encodeQr = (text: string): QrCode => {
  const { ver, data } = buildCodewords(text);
  const codewords = interleave(ver, data);
  const size = ver * 4 + 17;

  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Le timing en premier : les motifs de recherche viennent le recouvrir aux
  // trois coins. L'ordre compte — l'inverse laisse une ligne alternée en
  // travers des trois carrés, et plus aucun lecteur ne trouve le code.
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const aligns = alignPositions(ver);
  for (let i = 0; i < aligns.length; i++) {
    for (let j = 0; j < aligns.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === aligns.length - 1) ||
        (i === aligns.length - 1 && j === 0);
      if (corner) continue; // occupé par un motif de recherche
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(aligns[j] + dx, aligns[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  /** Niveau de correction et masque, en deux exemplaires, protégés par BCH. */
  const drawFormat = (mask: number) => {
    const formatData = (0b00 << 3) | mask; // 00 = niveau M
    let rem = formatData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((formatData << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true); // module toujours sombre
  };
  drawFormat(0); // réserve la place avant de poser les données

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }

  // Les données remontent et redescendent, deux colonnes à la fois.
  let placed = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // la colonne de timing ne porte rien
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && placed < codewords.length * 8) {
          modules[y][x] = ((codewords[placed >>> 3] >>> (7 - (placed & 7))) & 1) !== 0;
          placed++;
        }
      }
    }
  }

  let best: { score: number; modules: boolean[][] } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, isFunction, mask, size);
    drawFormat(mask);
    const score = penalty(modules, size);
    if (best === null || score < best.score) best = { score, modules: modules.map((row) => row.slice()) };
    applyMask(modules, isFunction, mask, size); // le masque est un XOR : on le retire
  }

  return { size, modules: best!.modules, version: ver };
};

/**
 * Le tracé SVG du carré, en une seule forme : un `<path>` de rectangles d'un
 * module de côté, dans un repère de `size + 2 * quiet` unités.
 *
 * La marge blanche (« quiet zone ») fait partie du code : sans elle, un
 * lecteur ne distingue pas le bord du carré de ce qui l'entoure.
 */
export const qrPath = (code: QrCode, quiet = 4): { path: string; extent: number } => {
  const parts: string[] = [];
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (code.modules[y][x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return { path: parts.join(""), extent: code.size + quiet * 2 };
};
