import { uuid } from './validation.js';
export interface OptionalField {
 name: string; label: string; type: 'text' | 'textarea' | 'uuid' | 'institution' | 'user' | 'number' | 'integer' | 'date' | 'datetime-local' | 'url' | 'json';
 hint?: string; min?: number; max?: number; maxLength?: number;
}
export const optionalFieldGroups: Record<string, OptionalField[]> = {
  actorDetails: [
    { name: 'externalId', label: 'Identifiant externe', type: 'text', maxLength: 255 },
    { name: 'birthDate', label: 'Date de naissance ou de création', type: 'date' },
    { name: 'deathDate', label: 'Date de décès ou de dissolution', type: 'date' },
    { name: 'description', label: 'Description de l’acteur', type: 'textarea', maxLength: 5000 }
  ],
  classificationDetails: [
    { name: 'ordre', label: 'Ordre dans le classement', type: 'integer', min: 0 },
    { name: 'dateDebutValidite', label: 'Début de validité', type: 'date' },
    { name: 'dateFinValidite', label: 'Fin de validité', type: 'date' }
  ],
  preservationDetails: [
    { name: 'source', label: 'État source (JSON)', type: 'json', hint: 'Objet décrivant le format, le support ou les propriétés avant intervention.' },
    { name: 'destination', label: 'État de destination (JSON)', type: 'json', hint: 'Objet décrivant les propriétés après intervention.' }
  ],
  dispositionEvidence: [
    { name: 'evidenceJson', label: 'Pièces complémentaires (JSON)', type: 'json', maxLength: 65536, hint: 'Objet de preuve complémentaire ; l’inventaire de destruction est produit par le serveur.' }
  ],
  workflowStart: [
    { name: 'definitionId', label: 'Définition du circuit', type: 'uuid', hint: 'Identifiant facultatif. Vide : circuit déterminé automatiquement pour le document.' },
    { name: 'context', label: 'Contexte du circuit (JSON)', type: 'json', hint: 'Objet de paramètres complémentaires du circuit.' }
  ],
  elementOrder: [{ name: 'ordre', label: 'Ordre de numérisation', type: 'integer', min: 0 }],

  "intake": [
    {
      "name": "sourceActeurId",
      "label": "Acteur source",
      "type": "uuid"
    },
    {
      "name": "sourceInstitutionId",
      "label": "Institution source",
      "type": "institution"
    },
    {
      "name": "instrument",
      "label": "Instrument d’entrée",
      "type": "text"
    },
    {
      "name": "responsableId",
      "label": "Responsable",
      "type": "user"
    }
  ],
  "storage": [
    {
      "name": "conditionsConservation",
      "label": "Conditions de conservation",
      "type": "json",
      "hint": "Objet décrivant les conditions : température, humidité, précautions…"
    }
  ],
  "archive": [
    {
      "name": "dateExtremeDebut",
      "label": "Date extrême de début",
      "type": "date"
    },
    {
      "name": "dateExtremeFin",
      "label": "Date extrême de fin",
      "type": "date"
    },
    {
      "name": "quantite",
      "label": "Quantité",
      "type": "number",
      "min": 0
    },
    {
      "name": "uniteQuantite",
      "label": "Unité de quantité",
      "type": "text",
      "maxLength": 30
    }
  ],
  "checkout": [
    {
      "name": "dateRetourPrevue",
      "label": "Retour prévu",
      "type": "datetime-local"
    }
  ],
  "project": [
    {
      "name": "responsableId",
      "label": "Responsable",
      "type": "user"
    },
    {
      "name": "dateDebut",
      "label": "Date de début",
      "type": "date"
    },
    {
      "name": "dateFinPrevue",
      "label": "Date de fin prévue",
      "type": "date"
    }
  ],
  "quality": [
    {
      "name": "nettete",
      "label": "Netteté",
      "type": "number"
    },
    {
      "name": "nombrePages",
      "label": "Nombre de pages",
      "type": "integer",
      "min": 1
    },
    {
      "name": "defauts",
      "label": "Défauts constatés",
      "type": "json",
      "hint": "Détails structurés des anomalies constatées."
    }
  ],
  "ocr": [
    {
      "name": "langue",
      "label": "Langue",
      "type": "text",
      "maxLength": 20
    },
    {
      "name": "moteur",
      "label": "Moteur de reconnaissance",
      "type": "text",
      "maxLength": 100
    },
    {
      "name": "versionMoteur",
      "label": "Version du moteur",
      "type": "text",
      "maxLength": 50
    },
    {
      "min": 0,
      "max": 1,
      "hint": "Valeur comprise entre 0 et 1.",
      "name": "confiance",
      "label": "Indice de confiance",
      "type": "number"
    },
    {
      "name": "numeroPage",
      "label": "Numéro de page",
      "type": "integer",
      "min": 1
    }
  ],
  "place": [
    {
      "name": "latitude",
      "label": "Latitude",
      "type": "number",
      "min": -90,
      "max": 90
    },
    {
      "name": "longitude",
      "label": "Longitude",
      "type": "number",
      "min": -180,
      "max": 180
    },
    {
      "name": "identifiantExterne",
      "label": "Identifiant externe",
      "type": "text",
      "maxLength": 255
    }
  ],
  "event": [
    {
      "name": "precisionDate",
      "label": "Précision des dates",
      "type": "text",
      "maxLength": 50,
      "hint": "Par exemple : année, mois, date exacte ou approximative."
    }
  ],
  "subject": [
    {
      "name": "identifiant",
      "label": "Identifiant du sujet",
      "type": "text",
      "maxLength": 255
    }
  ],
  "source": [
    {
      "name": "dateSource",
      "label": "Date de la source",
      "type": "date"
    },
    {
      "name": "uri",
      "label": "Lien vers la source",
      "type": "url"
    }
  ],
  "status": [
    {
      "name": "fichierId",
      "label": "Fichier concerné",
      "type": "uuid",
      "hint": "Facultatif : si renseigné, le statut vise ce fichier plutôt que le document."
    },
    {
      "name": "dateDebut",
      "label": "Début de validité",
      "type": "date"
    },
    {
      "name": "dateFin",
      "label": "Fin de validité",
      "type": "date"
    }
  ],
  "restriction": [
    {
      "name": "dateDebut",
      "label": "Début de la restriction",
      "type": "datetime-local"
    },
    {
      "name": "dateFin",
      "label": "Fin de la restriction",
      "type": "datetime-local"
    },
    {
      "name": "dateReexamen",
      "label": "Date de réexamen",
      "type": "datetime-local"
    },
    {
      "name": "reference",
      "label": "Référence",
      "type": "text",
      "maxLength": 255
    }
  ],
  "schema": [
    {
      "name": "effectiveFrom",
      "label": "Date d’effet",
      "type": "date"
    }
  ],
  "definition": [
    {
      "name": "effectiveFrom",
      "label": "Date d’effet",
      "type": "date"
    }
  ],
  "metadataField": [
    {
      "name": "description",
      "label": "Description",
      "type": "textarea"
    },
    {
      "name": "vocabulary",
      "label": "Vocabulaire",
      "type": "text",
      "maxLength": 255
    },
    {
      "name": "order",
      "label": "Ordre d’affichage",
      "type": "integer",
      "min": 0
    },
    {
      "name": "configuration",
      "label": "Contraintes avancées",
      "type": "json",
      "hint": "Objet facultatif : maxLength, pattern, min, max. Les valeurs de liste se renseignent séparément."
    }
  ],
  "step": [
    {
      "name": "delayMinutes",
      "label": "Délai de traitement (minutes)",
      "type": "integer",
      "min": 0
    }
  ],
  "transition": [
    {
      "name": "condition",
      "label": "Condition de passage",
      "type": "json",
      "hint": "Objet de règle : metadata, context, document, all, any ou not. Vide : sans condition."
    },
    {
      "name": "action",
      "label": "Action à effectuer",
      "type": "json",
      "hint": "Objet avec setContext, removeContext ou requireMetadataComplete. Vide : aucune action."
    }
  ],
  "binding": [
    {
      "name": "from",
      "label": "Début de validité",
      "type": "date"
    },
    {
      "name": "to",
      "label": "Fin de validité",
      "type": "date"
    }
  ],
  "workflowBinding": [
    {
      "name": "priority",
      "label": "Priorité",
      "type": "integer",
      "min": 0,
      "hint": "Si vide, le serveur utilise 100."
    },
    {
      "name": "from",
      "label": "Début de validité",
      "type": "date"
    },
    {
      "name": "to",
      "label": "Fin de validité",
      "type": "date"
    }
  ]
};
export function optionalPayload(fields: OptionalField[], values: Record<string,string>): Record<string,unknown> {
 const result: Record<string,unknown> = {};
 for (const f of fields) {
  const raw = (values[f.name] ?? '').trim();
  if (!raw) continue;
  let value: unknown = raw;
  if (f.maxLength && raw.length > f.maxLength) throw new Error(f.label + ' : texte trop long.');
  if (['uuid','institution','user'].includes(f.type)) value = uuid(raw);
  if (f.type === 'number' || f.type === 'integer') {
   const n = Number(raw);
   if (!Number.isFinite(n) || (f.type === 'integer' && !Number.isSafeInteger(n)) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw new Error(f.label + ' : nombre invalide.');
   value = n;
  }
  if (f.type === 'datetime-local') { const date = new Date(raw); if (!Number.isFinite(date.getTime())) throw new Error(f.label + ' : date invalide.'); value = date.toISOString(); }
  if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0,10) !== raw)) throw new Error(f.label + ' : date invalide.');
  if (f.type === 'url') { let url: URL; try { url = new URL(raw); } catch { throw new Error(f.label + ' : lien invalide.'); } if (!['https:','http:'].includes(url.protocol)) throw new Error(f.label + ' : lien HTTP ou HTTPS requis.'); }
  if (f.type === 'json') { try { value = JSON.parse(raw); } catch { throw new Error(f.label + ' : JSON invalide.'); } if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(f.label + ' : un objet est requis.'); }
  result[f.name] = value;
 }
 for (const [start,end] of [['dateExtremeDebut','dateExtremeFin'],['dateDebut','dateFin'],['dateDebut','dateFinPrevue'],['from','to']]) {
  if (start && end && typeof result[start] === 'string' && typeof result[end] === 'string' && Date.parse(result[start] as string) > Date.parse(result[end] as string)) throw new Error('La date de fin doit suivre la date de début.');
 }
 return result;
}
