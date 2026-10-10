/**
 * IhcTypes.ts
 * OncoCare Pro - Type definitions for Immunohistochemistry (IHC/HMMD) & History Logs
 */

export type BreastCancerSubtype = 
  | 'Luminal A'
  | 'Luminal B (HER2-)'
  | 'Luminal B (HER2+)'
  | 'Tam âm / Triple Negative (TNBC)';

export interface IhcData {
  subtype: BreastCancerSubtype | string;
  erStatus?: string;   // e.g. "Dương tính (+)", "Âm tính (-)"
  prStatus?: string;   // e.g. "Dương tính (+)", "Âm tính (-)"
  her2Status?: string; // e.g. "Dương tính (3+)", "Âm tính (0/1+)", "Nghi ngờ (2+)"
  ki67?: string;       // e.g. "15%", "25%"
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type HistoryLogType = 'IHC_UPDATE' | 'MARKER_ADD';

export interface PatientHistoryLog {
  id: string;
  timestamp: string; // ISO String format
  type: HistoryLogType;
  description: string;
  performedBy?: string;
  metadata?: Record<string, any>;
}

export interface IhcSubtypeConfig {
  key: BreastCancerSubtype;
  label: string;
  description: string;
  treatmentHint: string;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
}

export const BREAST_CANCER_SUBTYPES: IhcSubtypeConfig[] = [
  {
    key: 'Luminal A',
    label: 'Luminal A',
    description: 'ER(+) và/hoặc PR(+), HER2(-), Ki-67 thấp (<20%)',
    treatmentHint: 'Tiên lượng tốt nhất, đáp ứng cao với liệu pháp nội tiết.',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50/50'
  },
  {
    key: 'Luminal B (HER2-)',
    label: 'Luminal B (HER2-)',
    description: 'ER(+) và/hoặc PR(+) kém, HER2(-), Ki-67 cao (≥20%)',
    treatmentHint: 'Nhạy nội tiết, cân nhắc hóa trị bổ trợ do độc lực sinh học cao hơn Luminal A.',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    borderClass: 'border-indigo-200',
    bgClass: 'bg-indigo-50/50'
  },
  {
    key: 'Luminal B (HER2+)',
    label: 'Luminal B (HER2+)',
    description: 'ER(+) và/hoặc PR(+), HER2(+), Ki-67 bất kỳ',
    treatmentHint: 'Điều trị phối hợp: Hóa trị + Liệu pháp nhắm trúng đích (Trastuzumab) + Nội tiết.',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50/50'
  },
  {
    key: 'Tam âm / Triple Negative (TNBC)',
    label: 'Tam âm / Triple Negative (TNBC)',
    description: 'ER(-), PR(-), HER2(-)',
    treatmentHint: 'Không đáp ứng với liệu pháp nội tiết & nhắm trúng đích HER2. Điều trị bằng Hóa trị / Miễn dịch.',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    borderClass: 'border-rose-200',
    bgClass: 'bg-rose-50/50'
  }
];
