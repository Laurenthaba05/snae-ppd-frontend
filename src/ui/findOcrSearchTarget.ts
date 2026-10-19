import type { RecordsApi } from '../api/records';
import type { DigitizationApi } from '../api/digitization';
import { fileIsReadable, previewKind } from '../core/file-content';
import { ocrSearchMatcher, type OcrSearchTarget } from '../core/ocrSearch';
/** On demand only. Use the indexed (latest) version and the existing, access-controlled APIs.
 * Stop at the first matching page; closing the dialog aborts the remaining work. */
export async function findOcrSearchTarget(records: Pick<RecordsApi, 'versions' | 'files'>,
    digitization: Pick<DigitizationApi, 'ocrResultsByFile' | 'ocrLayout'>,
    documentId: string, query: string, signal: AbortSignal): Promise<OcrSearchTarget | null> {
    if (!/[\p{L}\p{N}]/u.test(query)) return null;
    const matches = ocrSearchMatcher(query);
    const versions = await records.versions(documentId, signal);
    signal.throwIfAborted();
    const version = [...versions].sort((a,b) => b.number-a.number)[0];
    if (!version) return null;
    const files = (await records.files(version.id, signal)).filter(f => fileIsReadable(f) && previewKind(f.mediaType, f.size) === 'pdf')
        .sort((a,b) => a.id.localeCompare(b.id));
    let requests = 0;
    const budget = () => {
        signal.throwIfAborted();
        if (++requests > 200) throw new Error('Ce document est volumineux. Précisez votre recherche ou consultez ses fichiers depuis la notice.');
    };
    for (const file of files) {
        budget();
        const results = (await digitization.ocrResultsByFile(file.id, signal))
            .filter(r => r.statutValidation === 'VALIDE' && r.hasLayout && matches(r.texte))
            .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
        for (const result of results) {
            const pages = [...new Set(result.layoutPages ?? [result.numeroPage ?? 1])]
                .filter(p => Number.isSafeInteger(p) && p > 0).sort((a,b) => a-b);
            for (const page of pages) {
                budget();
                const layout = await digitization.ocrLayout(result.id, signal, page);
                signal.throwIfAborted();
                if (layout.resultId === result.id && (layout.pageNumber ?? 1) === page && layout.words.some(w => matches(w.text)))
                    return { file, focus: { resultId: result.id, page, query } };
            }
        }
    }
    return null;
}
