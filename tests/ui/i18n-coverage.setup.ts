import { afterEach, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { EN, registerCatalog, resetCatalogs, translate } from '../../src/core/i18n';
import { EN_SCREENS } from '../../src/core/i18nScreens';

/**
 * Mesure de couverture de la traduction anglaise sur les vrais écrans, avec les données de test des suites d'écrans. Activée seulement par `I18N_COVERAGE_OUT=<fichier>` :
 * à la fin de chaque test, avant le nettoyage, chaque texte affiché est rangé dans l'une de trois classes — « couvert » (le catalogue le traduit), « français hors catalogue » (il
 * ressemble à du français et aucune traduction n'existe) ou « autre » (nom, code, nombre, donnée). Une ligne JSON par test ; `scripts/i18n-coverage.mjs` fait la somme.
 * Ce n'est pas une preuve de qualité de la traduction : seulement de sa présence.
 */
const OUT = process.env.I18N_COVERAGE_OUT;

// Le test mesure ce que le moteur de traduction ferait vraiment : même recherche (texte exact, modèle, valeur chiffrée) que l'interface en anglais.
const exact = new Set<string>([...Object.keys(EN), ...Object.keys(EN_SCREENS)].filter(key => !key.includes('{n}')));
const covered = (text: string) => exact.has(text) || translate('en', text) !== text;

const ACCENTED = /[àâäçéèêëîïôöùûüœÀÂÉÈÊÎÔÙÛÇ]/;
const FRENCH_WORD = /(^|[\s’'(])(le|la|les|des|du|de|un|une|et|ou|pour|sur|avec|sans|dans|est|sont|par|au|aux|ce|cette|ces|vous|votre|vos|aucun|aucune|non|pas|plus|d’|l’)([\s’',.:;)]|$)/i;
const looksFrench = (text: string) => ACCENTED.test(text) || (text.includes(' ') && FRENCH_WORD.test(text));
const SKIP = 'script,style,code,pre,textarea,option,svg,[translate="no"],[data-no-translate],[lang="fr"]';

if (OUT) {
    afterEach(() => {
        resetCatalogs();
        registerCatalog(EN_SCREENS);
        const record = { file: (expect.getState().testPath ?? '').replace(/^.*[\\/]tests[\\/]/, ''), covered: 0, french: 0, other: 0, frenchTexts: [] as string[] };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const parent = (node as Text).parentElement;
            if (!parent || parent.closest(SKIP)) continue;
            const text = (node as Text).data.replace(/\s+/g, ' ').trim();
            if (text.length < 2 || !/\p{L}/u.test(text)) continue;
            if (covered(text)) record.covered++;
            else if (looksFrench(text)) { record.french++; if (record.frenchTexts.length < 60) record.frenchTexts.push(text.slice(0, 160)); }
            else record.other++;
        }
        appendFileSync(OUT, JSON.stringify(record) + '\n');
    });
}
