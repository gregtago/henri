import type { Capture } from '../lib/types';

interface Props {
  captures: Capture[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onToast: (msg: string) => void;
}

const STATUS_LABEL: Record<Capture['status'], string> = {
  texte: 'texte natif',
  ocr: 'OCR',
  'en-cours': 'OCR…',
  erreur: 'erreur',
};

export function CapturesPanel({ captures, onRemove, onClear, onToast }: Props) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('Copié');
    } catch {
      onToast('⚠ Copie impossible');
    }
  };

  const copyAll = () => {
    const all = captures
      .filter((c) => c.text)
      .map((c) => c.text)
      .join('\n\n');
    if (all) copy(all);
  };

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="section-label">Extractions</span>
        {captures.length > 0 && (
          <div className="panel-head-actions">
            <button className="btn-ghost" onClick={copyAll}>Tout copier</button>
            <button className="btn-ghost btn-danger" onClick={onClear}>Vider</button>
          </div>
        )}
      </div>

      {captures.length === 0 ? (
        <div className="panel-empty">
          Surlignez une zone dans le document pour en extraire le texte.
        </div>
      ) : (
        <ul className="capture-list">
          {captures.map((c) => (
            <li key={c.id} className="capture" data-status={c.status}>
              <div className="capture-meta">
                <span className={`badge badge-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                <span className="capture-src">
                  {c.docName} · p.{c.page}
                  {c.confidence != null && c.status === 'ocr' ? ` · ${c.confidence}%` : ''}
                </span>
              </div>
              <div className="capture-text">
                {c.status === 'en-cours' ? <span className="muted">Reconnaissance en cours…</span> : c.text || <span className="muted">— vide —</span>}
              </div>
              <div className="capture-actions">
                <button className="btn-ghost" disabled={!c.text} onClick={() => copy(c.text)}>Copier</button>
                <button className="btn-ghost btn-danger" onClick={() => onRemove(c.id)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
