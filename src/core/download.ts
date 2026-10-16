/**
 * Enregistre un fichier produit par le serveur ou fabriqué dans le navigateur (tableur, XML, PDF, ZIP) sans passer par une adresse : le contenu ne quitte pas le navigateur. L'adresse
 * temporaire est libérée après `revokeAfterMs` (assez long pour qu'un enregistrement lent aboutisse).
 */
export function saveBlob(blob: Blob, fileName: string, revokeAfterMs = 1000): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}
