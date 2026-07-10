import { PageView, type SelectionPayload } from './PageView';
import type { PdfDoc } from '../lib/types';

interface Props {
  doc: PdfDoc;
  scale: number;
  onSelect: (p: SelectionPayload) => void;
}

export function PdfDocumentView({ doc, scale, onSelect }: Props) {
  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return (
    <div className="doc-scroll">
      <div className="doc-pages">
        {pages.map((n) => (
          // key inclut le doc : repart de zéro quand on change d'onglet.
          <PageView key={`${doc.id}-${n}`} pdf={doc.pdf} pageNumber={n} scale={scale} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
