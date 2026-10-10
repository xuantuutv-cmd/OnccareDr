/**
 * ihcService.js
 * OncoCare Pro - Service module for Immunohistochemistry (IHC) & History Logs
 */

export const BREAST_CANCER_SUBTYPES_LIST = [
    { key: 'Luminal A', label: 'Luminal A', desc: 'ER(+)/PR(+), HER2(-), Ki-67 thấp (<20%)' },
    { key: 'Luminal B (HER2-)', label: 'Luminal B (HER2-)', desc: 'ER(+)/PR(+) kém, HER2(-), Ki-67 cao (≥20%)' },
    { key: 'Luminal B (HER2+)', label: 'Luminal B (HER2+)', desc: 'ER(+)/PR(+), HER2(+), Ki-67 bất kỳ' },
    { key: 'Tam âm / Triple Negative (TNBC)', label: 'Tam âm / Triple Negative (TNBC)', desc: 'ER(-), PR(-), HER2(-)' }
];

/**
 * Format ISO timestamp string into user-friendly Vietnamese date-time
 */
export function formatHistoryTimestamp(isoString) {
    if (!isoString) return 'N/A';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const hours = d.getHours().toString().padStart(2, '0');
        const mins = d.getMinutes().toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${hours}:${mins} - ${day}/${month}/${year}`;
    } catch {
        return isoString;
    }
}

/**
 * Get CSS badge styling for IHC Subtype
 */
export function getIhcSubtypeBadgeClass(subtype) {
    switch (subtype) {
        case 'Luminal A':
            return 'bg-emerald-100 text-emerald-800 border-emerald-300';
        case 'Luminal B (HER2-)':
            return 'bg-indigo-100 text-indigo-800 border-indigo-300';
        case 'Luminal B (HER2+)':
            return 'bg-amber-100 text-amber-900 border-amber-300';
        case 'Tam âm / Triple Negative (TNBC)':
            return 'bg-rose-100 text-rose-800 border-rose-300';
        default:
            return 'bg-slate-100 text-slate-700 border-slate-200';
    }
}
