import { useCallback, useRef, useState } from 'react';
import { loadPdf } from './lib/pdf';
import { ocr } from './lib/ocr';
import { cropRegion, looksLikeText, textLayerInRect } from './lib/extract';
import type { Capture, PdfDoc } from './lib/types';
import { PdfDocumentView } from './components/PdfDocumentView';
import type { SelectionPayload } from './components/PageView';
import { CapturesPanel } from './components/CapturesPanel';

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5];

export default function App() {
  const [docs, setDocs] = useState<PdfDoc[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scale, setScale] = useState(1.5);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const active = docs.find((d) => d.id === activeId) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const openFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      const added: PdfDoc[] = [];
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') continue;
        try {
          const buf = await file.arrayBuffer();
          const pdf = await loadPdf(buf);
          added.push({ id: crypto.randomUUID(), name: file.name, pdf, numPages: pdf.numPages });
        } catch {
          showToast(`⚠ Échec d'ouverture : ${file.name}`);
        }
      }
      if (added.length) {
        setDocs((d) => [...d, ...added]);
        setActiveId(added[added.length - 1].id);
        showToast(added.length > 1 ? `${added.length} PDF ouverts` : 'PDF ouvert');
      }
      setBusy(false);
    },
    [showToast],
  );

  const closeDoc = useCallback(
    (id: string) => {
      setDocs((prev) => {
        const next = prev.filter((d) => d.id !== id);
        setActiveId((cur) => (cur === id ? next[next.length - 1]?.id ?? null : cur));
        return next;
      });
    },
    [],
  );

  const handleSelect = useCallback(
    async (p: SelectionPayload) => {
      if (!active) return;
      const native = textLayerInRect(p.textContent, p.viewport, p.rect);

      if (looksLikeText(native)) {
        setCaptures((c) => [
          {
            id: crypto.randomUUID(),
            docId: active.id,
            docName: active.name,
            page: p.page,
            status: 'texte',
            text: native,
            createdAt: Date.now(),
          },
          ...c,
        ]);
        return;
      }

      // Pas de texte natif → OCR sur l'image de la zone.
      const id = crypto.randomUUID();
      setCaptures((c) => [
        {
          id,
          docId: active.id,
          docName: active.name,
          page: p.page,
          status: 'en-cours',
          text: '',
          createdAt: Date.now(),
        },
        ...c,
      ]);
      try {
        const crop = cropRegion(p.canvas, p.rect, 2);
        const res = await ocr(crop);
        setCaptures((c) =>
          c.map((x) =>
            x.id === id
              ? { ...x, status: res.text ? 'ocr' : 'erreur', text: res.text, confidence: res.confidence }
              : x,
          ),
        );
      } catch {
        setCaptures((c) => c.map((x) => (x.id === id ? { ...x, status: 'erreur' } : x)));
        showToast('⚠ Échec de l’OCR');
      }
    },
    [active, showToast],
  );

  const removeCapture = (id: string) => setCaptures((c) => c.filter((x) => x.id !== id));
  const clearCaptures = () => setCaptures([]);

  const zoomStep = (dir: 1 | -1) => {
    setScale((s) => {
      const i = ZOOMS.findIndex((z) => z >= s);
      const idx = Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + dir));
      return ZOOMS[idx];
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▤</span>
          <span className="brand-name">Lecteur PDF</span>
          <span className="brand-sub">OCR sélectif</span>
        </div>
        <div className="topbar-actions">
          {active && (
            <div className="zoom">
              <button className="btn-ghost" onClick={() => zoomStep(-1)} aria-label="Dézoomer">−</button>
              <span className="zoom-val">{Math.round(scale * 100)}%</span>
              <button className="btn-ghost" onClick={() => zoomStep(1)} aria-label="Zoomer">+</button>
            </div>
          )}
          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Ouverture…' : 'Ouvrir des PDF'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              openFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {docs.length > 0 && (
        <nav className="tabs">
          {docs.map((d) => (
            <div key={d.id} className={`tab${d.id === activeId ? ' tab-active' : ''}`} onClick={() => setActiveId(d.id)}>
              <span className="tab-name" title={d.name}>{d.name}</span>
              <button
                className="tab-close"
                aria-label="Fermer"
                onClick={(e) => {
                  e.stopPropagation();
                  closeDoc(d.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </nav>
      )}

      <main className="workspace">
        <section className="viewer">
          {active ? (
            <PdfDocumentView doc={active} scale={scale} onSelect={handleSelect} />
          ) : (
            <div className="welcome">
              <div className="welcome-card">
                <div className="welcome-title">Ouvrez un ou plusieurs PDF</div>
                <p className="welcome-p">
                  Surlignez une zone à la souris : le texte est extrait de la couche du PDF s’il existe,
                  sinon reconnu par OCR. <strong>Tout se passe sur votre poste</strong> — aucun document
                  n’est envoyé sur Internet.
                </p>
                <button className="btn-primary" onClick={() => fileRef.current?.click()}>Ouvrir des PDF</button>
              </div>
            </div>
          )}
        </section>
        <CapturesPanel captures={captures} onRemove={removeCapture} onClear={clearCaptures} onToast={showToast} />
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
