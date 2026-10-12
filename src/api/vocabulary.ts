import type { Transport } from '../core/http.js';
import { query } from '../core/http.js';
import { uuid } from '../core/validation.js';
import type { DocumentForm, Keyword, KeywordHitPage, KeywordKind, KeywordReplaceResult, TermPage, TermsImportResult, Vocabulary, VocabularyTerm } from '../core/vocabulary.js';

const OBJECTS: Record<KeywordKind, string> = { DOCUMENT: 'documents', DOSSIER: 'dossiers', BIEN: 'heritage/assets', NOTICE: 'archives/descriptions' };

/** Vocabulaires contrôlés, mots-clés des documents et des dossiers, forme du document (V92). */
export class VocabularyApi {
    constructor(readonly transport: Transport) { }
    list(institutionId: string | null | undefined, includeRetired: boolean, signal?: AbortSignal): Promise<Vocabulary[]> {
        return this.transport.request('/vocabularies' + query({ institutionId, includeRetired: includeRetired ? 'true' : undefined }), { signal });
    }
    create(input: { institutionId: string | null; code: string; name: string; description?: string; source?: string }, key: string): Promise<Vocabulary> {
        return this.command('/vocabularies', input, key);
    }
    retire(id: string, key: string): Promise<Vocabulary> { return this.command('/vocabularies/' + uuid(id) + '/retire', {}, key); }
    terms(vocabularyId: string, params: { q?: string; status?: string; page?: number }, signal?: AbortSignal): Promise<TermPage> {
        return this.transport.request('/vocabularies/' + uuid(vocabularyId) + '/terms' + query({ q: params.q, status: params.status, page: params.page }), { signal });
    }
    createTerm(vocabularyId: string, input: { label: string; definition?: string; parentId?: string | null; alternativeLabels: string[] }, key: string): Promise<VocabularyTerm> {
        return this.command('/vocabularies/' + uuid(vocabularyId) + '/terms', input, key);
    }
    updateTerm(termId: string, input: { definition?: string; parentId?: string | null; alternativeLabels: string[] }, key: string): Promise<VocabularyTerm> {
        return this.command('/vocabulary-terms/' + uuid(termId) + '/update', input, key);
    }
    /** Remplace partout le terme obsolète par son remplaçant déclaré ; ne rend que des décomptes. */
    replaceUsages(termId: string, key: string): Promise<KeywordReplaceResult> { return this.command(`/vocabulary-terms/${uuid(termId)}/replace-usages`, {}, key); }
    obsoleteTerm(termId: string, reason: string, replacementId: string | null, key: string): Promise<VocabularyTerm> {
        return this.command('/vocabulary-terms/' + uuid(termId) + '/obsolete', { reason, replacementId }, key);
    }
    importTerms(vocabularyId: string, csv: string, key: string): Promise<TermsImportResult> { return this.command('/vocabularies/' + uuid(vocabularyId) + '/terms/import', { csv }, key); }
    /** Importe un thésaurus SKOS (JSON-LD ou RDF/XML) : mêmes règles que le CSV, tout ou rien. */
    importSkos(vocabularyId: string, content: string, key: string): Promise<TermsImportResult> {
        return this.command('/vocabularies/' + uuid(vocabularyId) + '/terms/import-skos', { content }, key);
    }
    /** Le vocabulaire en SKOS (JSON-LD), à enregistrer. */
    skos(vocabularyId: string, signal?: AbortSignal): Promise<Blob> { return this.transport.request('/vocabularies/' + uuid(vocabularyId) + '/skos', { signal, responseType: 'blob' }); }

    /** Les documents ou dossiers indexés par ce terme, parmi ceux que l'on peut lire. */
    termObjects(termId: string, kind: KeywordKind, page: number, signal?: AbortSignal): Promise<KeywordHitPage> {
        return this.transport.request('/vocabulary-terms/' + uuid(termId) + '/objects' + query({ kind, page }), { signal });
    }

    keywords(kind: KeywordKind, objectId: string, signal?: AbortSignal): Promise<Keyword[]> { return this.transport.request(`/${OBJECTS[kind]}/${uuid(objectId)}/keywords`, { signal }); }
    addKeywords(kind: KeywordKind, objectId: string, termIds: string[], key: string): Promise<Keyword[]> { return this.command(`/${OBJECTS[kind]}/${uuid(objectId)}/keywords`, { termIds }, key); }
    removeKeyword(kind: KeywordKind, objectId: string, termId: string, key: string): Promise<Keyword[]> {
        return this.command(`/${OBJECTS[kind]}/${uuid(objectId)}/keywords/${uuid(termId)}/remove`, {}, key);
    }

    form(documentId: string, signal?: AbortSignal): Promise<DocumentForm> { return this.transport.request('/documents/' + uuid(documentId) + '/form', { signal }); }
    setForm(documentId: string, form: string, precision: string | null, version: number, key: string): Promise<DocumentForm> {
        return this.command('/documents/' + uuid(documentId) + '/form', { form, precision, version }, key);
    }

    command<T>(path: string, body: unknown, key: string): Promise<T> { return this.transport.request(path, { method: 'POST', body, idempotencyKey: key }); }
}
