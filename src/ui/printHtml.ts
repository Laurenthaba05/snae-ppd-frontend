/** Imprime un document HTML autonome depuis un cadre invisible : aucun contenu ne quitte le navigateur. */
export function printHtml(html: string): void {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true'); frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument; const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return; }
    doc.open(); doc.write(html); doc.close();
    win.focus(); win.print();
    setTimeout(() => frame.remove(), 60_000);
}
