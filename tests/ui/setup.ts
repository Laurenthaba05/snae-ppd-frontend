import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Les écrans se rendent dans jsdom : une attente de 1 s (valeur par défaut) échoue par intermittence sur une machine chargée, sans rien révéler d'un défaut.
configure({ asyncUtilTimeout: 4000 });

afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
    });
};
if (!Blob.prototype.text) Blob.prototype.text = function () {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
    });
};
Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:private-file') });
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
