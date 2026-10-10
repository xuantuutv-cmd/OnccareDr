/**
 * toxicityStatsHelper.ts
 * OncoCare Pro - Chemotherapy CTCAE Toxicity Analytics Helper
 * 
 * Module tính toán và tổng hợp số liệu độc tính hóa trị theo tiêu chuẩn CTCAE.
 * Đảm bảo kiến trúc an toàn: chỉ đọc dữ liệu, không làm thay đổi dữ liệu Firestore hiện tại.
 */

import { collection, getDocs, query, Firestore } from 'firebase/firestore';

// ============================================================================
// 1. DATA TYPES & INTERFACES
// ============================================================================

export interface ToxicityItem {
  organ: string;        // Tên cơ quan / độc tính (VD: 'Hạ bạch cầu đa nhân trung tính (ANC)')
  grade: number;        // Độ nặng CTCAE: 1, 2, 3, 4, 5
  description?: string; // Mô tả lâm sàng tiêu chuẩn
}

export interface ToxicityAssessment {
  date: string;         // Định dạng 'YYYY-MM-DD'
  recordedAt?: number;  // Timestamp tính bằng milliseconds
  items: ToxicityItem[];
}

export interface ChemotherapyCycle {
  date?: string;
  startDate?: string;
  protocolUsed?: string;
  cycleNumber?: number;
  [key: string]: any;
}

export interface PatientRecord {
  id: string;                      // Document ID trong Firestore
  patientId?: string;             // Mã hồ sơ BN (VD: "BN001")
  name?: string;                  // Tên bệnh nhân
  protocol?: string;              // Phác đồ hóa trị chính
  defaultProtocol?: string;
  protocolKey?: string;
  diagnosis?: string;             // Chẩn đoán & ICD
  gender?: string;                // Nam / Nữ
  birthYear?: string | number;
  cycles?: ChemotherapyCycle[];
  toxicityAssessments?: ToxicityAssessment[];
  [key: string]: any;
}

export type TimeFilterPeriod = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom';

export interface ToxicityFilterCriteria {
  period: TimeFilterPeriod;
  startDate?: string;             // 'YYYY-MM-DD'
  endDate?: string;               // 'YYYY-MM-DD'
  protocol?: string;              // 'ALL' hoặc tên phác đồ cụ thể
  gradeFilter?: 'all' | 'severe' | 'critical'; // 'all' | 'severe' (>= 3) | 'critical' (>= 4)
}

export interface FlattenedToxicityEvent {
  patientDocId: string;
  patientCode: string;
  patientName: string;
  protocol: string;
  assessmentDate: string;
  recordedAt?: number;
  organ: string;
  grade: number;
  description: string;
  isSevere: boolean;   // Grade >= 3
  isCritical: boolean; // Grade >= 4
}

export interface ToxicityKPIs {
  totalAssessments: number;          // Tổng số lượt khám/đánh giá độc tính
  totalPatientsWithToxicity: number; // Tổng số BN ghi nhận có ít nhất 1 độc tính
  totalEvents: number;               // Tổng số biến cố độc tính phát hiện
  severeEventsCount: number;         // Số biến cố độc tính nặng (Grade >= 3)
  severeEventsRate: number;          // Tỷ lệ biến cố nặng (%)
  criticalEventsCount: number;       // Số biến cố nguy kịch (Grade >= 4)
  criticalEventsRate: number;        // Tỷ lệ biến cố nguy kịch (%)
  grade1Count: number;
  grade2Count: number;
  grade3Count: number;
  grade4Count: number;
  grade5Count: number;
}

export interface TopToxicityItem {
  organ: string;
  totalCount: number;
  mildCount: number;    // Grade 1-2
  severeCount: number;  // Grade 3-5
  percentage: number;   // % trên tổng số biến cố
}

export interface ProtocolToxicitySummary {
  protocol: string;
  totalEvents: number;
  patientsCount: number;
  mildCount: number;    // Grade 1-2
  severeCount: number;  // Grade 3-5
  severeRate: number;   // % Grade >= 3 trong phác đồ đó
}

export interface GradeDistributionData {
  labels: string[];
  counts: number[];
  percentages: number[];
  colors: string[];
}

// ============================================================================
// 2. HELPER CALCULATIONS & DATE RANGE UTILITIES
// ============================================================================

/**
 * Tính ngày bắt đầu và kết thúc theo bộ lọc chu kỳ thời gian
 */
export function calculateDateRange(period: TimeFilterPeriod): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 - 11

  const formatIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  switch (period) {
    case 'this_month': {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      return { startDate: formatIsoDate(firstDay), endDate: formatIsoDate(lastDay) };
    }
    case 'last_month': {
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      return { startDate: formatIsoDate(firstDay), endDate: formatIsoDate(lastDay) };
    }
    case 'this_quarter': {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const firstDay = new Date(year, quarterStartMonth, 1);
      const lastDay = new Date(year, quarterStartMonth + 3, 0);
      return { startDate: formatIsoDate(firstDay), endDate: formatIsoDate(lastDay) };
    }
    case 'this_year': {
      const firstDay = new Date(year, 0, 1);
      const lastDay = new Date(year, 11, 31);
      return { startDate: formatIsoDate(firstDay), endDate: formatIsoDate(lastDay) };
    }
    case 'all':
    default:
      return { startDate: '', endDate: '' };
  }
}

/**
 * Xác định phác đồ của bệnh nhân tại thời điểm đánh giá độc tính
 */
export function resolveProtocolForAssessment(patient: PatientRecord, assessmentDate: string): string {
  const fallbackProtocol = patient.protocol || patient.defaultProtocol || 'Chưa cập nhật';
  const assessmentTime = new Date(assessmentDate).getTime();
  const validCycles = (Array.isArray(patient.cycles) ? patient.cycles : [])
    .map(cycle => {
      const cycleDate = cycle.startDate || cycle.date;
      const normalizedDate = typeof cycleDate === 'string' ? cycleDate.trim() : '';
      return { cycle, cycleTime: normalizedDate ? new Date(normalizedDate).getTime() : Number.NaN };
    })
    .filter(({ cycleTime }) => Number.isFinite(cycleTime))
    .sort((a, b) => a.cycleTime - b.cycleTime);

  if (!Number.isFinite(assessmentTime)) return fallbackProtocol;

  for (let index = validCycles.length - 1; index >= 0; index--) {
    const { cycle, cycleTime } = validCycles[index];
    if (cycleTime <= assessmentTime && cycle.protocolUsed) return cycle.protocolUsed;
  }

  return fallbackProtocol;
}

/**
 * Trích xuất danh sách tất cả các biến cố độc tính phẳng (flattened) đã lọc
 */
export function extractFilteredToxicityEvents(
  patients: PatientRecord[],
  criteria: ToxicityFilterCriteria
): {
  events: FlattenedToxicityEvent[];
  assessmentsCount: number;
  patientsCount: number;
} {
  try {
    let effectiveStartDate = criteria.startDate || '';
    let effectiveEndDate = criteria.endDate || '';

    if (criteria.period !== 'custom' && criteria.period !== 'all') {
      const range = calculateDateRange(criteria.period);
      effectiveStartDate = range.startDate;
      effectiveEndDate = range.endDate;
    }

    const events: FlattenedToxicityEvent[] = [];
    const matchedAssessmentKeys = new Set<string>();
    const matchedPatientIds = new Set<string>();

    for (const patient of patients || []) {
      const assessments = patient.toxicityAssessments || [];
      if (!Array.isArray(assessments) || assessments.length === 0) continue;

      for (const assessment of assessments) {
        const assessDate = assessment.date || '';

        // 1. Lọc theo thời gian
        if (effectiveStartDate && assessDate < effectiveStartDate) continue;
        if (effectiveEndDate && assessDate > effectiveEndDate) continue;

        // 2. Xác định phác đồ liên quan
        const protocol = resolveProtocolForAssessment(patient, assessDate);

        // 3. Lọc theo phác đồ
        if (criteria.protocol && criteria.protocol !== 'ALL') {
          if (protocol.toLowerCase().trim() !== criteria.protocol.toLowerCase().trim()) {
            continue;
          }
        }

        const items = assessment.items || [];
        if (!Array.isArray(items) || items.length === 0) continue;

        let hasMatchingItemInAssessment = false;

        for (const item of items) {
          const grade = Number(item.grade) || 0;
          if (grade < 1) continue;

          // 4. Lọc theo mức độ nghiêm trọng
          if (criteria.gradeFilter === 'severe' && grade < 3) continue;
          if (criteria.gradeFilter === 'critical' && grade < 4) continue;

          hasMatchingItemInAssessment = true;
          events.push({
            patientDocId: patient.id,
            patientCode: patient.patientId || patient.id.slice(0, 6),
            patientName: patient.name || 'Không có tên',
            protocol,
            assessmentDate: assessDate,
            recordedAt: assessment.recordedAt,
            organ: item.organ || 'Độc tính khác',
            grade,
            description: item.description || '',
            isSevere: grade >= 3,
            isCritical: grade >= 4
          });
        }

        if (hasMatchingItemInAssessment) {
          const assessKey = `${patient.id}_${assessDate}_${assessment.recordedAt || ''}`;
          matchedAssessmentKeys.add(assessKey);
          matchedPatientIds.add(patient.id);
        }
      }
    }

    return {
      events,
      assessmentsCount: matchedAssessmentKeys.size,
      patientsCount: matchedPatientIds.size
    };
  } catch (error) {
    console.error('Lỗi khi lọc dữ liệu độc tính:', error);
    return { events: [], assessmentsCount: 0, patientsCount: 0 };
  }
}

/**
 * Tính toán toàn bộ chỉ số KPI từ danh sách biến cố độc tính
 */
export function calculateToxicityKPIs(
  events: FlattenedToxicityEvent[],
  assessmentsCount: number,
  patientsCount: number
): ToxicityKPIs {
  const totalEvents = events.length;

  let g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0;
  for (const ev of events) {
    if (ev.grade === 1) g1++;
    else if (ev.grade === 2) g2++;
    else if (ev.grade === 3) g3++;
    else if (ev.grade === 4) g4++;
    else if (ev.grade >= 5) g5++;
  }

  const severeEventsCount = g3 + g4 + g5;
  const criticalEventsCount = g4 + g5;
  const severeEventsRate = totalEvents > 0 ? Number(((severeEventsCount / totalEvents) * 100).toFixed(1)) : 0;
  const criticalEventsRate = totalEvents > 0 ? Number(((criticalEventsCount / totalEvents) * 100).toFixed(1)) : 0;

  return {
    totalAssessments: assessmentsCount,
    totalPatientsWithToxicity: patientsCount,
    totalEvents,
    severeEventsCount,
    severeEventsRate,
    criticalEventsCount,
    criticalEventsRate,
    grade1Count: g1,
    grade2Count: g2,
    grade3Count: g3,
    grade4Count: g4,
    grade5Count: g5
  };
}

/**
 * Top các độc tính xuất hiện nhiều nhất (dùng cho Horizontal Bar Chart)
 */
export function getTopToxicities(events: FlattenedToxicityEvent[], limit = 7): TopToxicityItem[] {
  const organMap = new Map<string, { total: number; mild: number; severe: number }>();

  for (const ev of events) {
    const existing = organMap.get(ev.organ) || { total: 0, mild: 0, severe: 0 };
    existing.total += 1;
    if (ev.grade >= 3) {
      existing.severe += 1;
    } else {
      existing.mild += 1;
    }
    organMap.set(ev.organ, existing);
  }

  const totalEvents = events.length || 1;
  const sorted = Array.from(organMap.entries())
    .map(([organ, data]) => ({
      organ,
      totalCount: data.total,
      mildCount: data.mild,
      severeCount: data.severe,
      percentage: Number(((data.total / totalEvents) * 100).toFixed(1))
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  return sorted.slice(0, limit);
}

/**
 * Phân bố mức độ nặng CTCAE Grade 1-5 (dùng cho Donut/Pie hoặc Stacked Bar)
 */
export function getGradeDistribution(kpis: ToxicityKPIs): GradeDistributionData {
  const total = kpis.totalEvents || 1;
  const counts = [
    kpis.grade1Count,
    kpis.grade2Count,
    kpis.grade3Count,
    kpis.grade4Count,
    kpis.grade5Count
  ];

  return {
    labels: ['Độ 1 (Nhẹ)', 'Độ 2 (Vừa)', 'Độ 3 (Nặng)', 'Độ 4 (Nguy kịch)', 'Độ 5 (Tử vong)'],
    counts,
    percentages: counts.map(c => Number(((c / total) * 100).toFixed(1))),
    colors: [
      '#38bdf8', // Light Blue (Độ 1)
      '#fbbf24', // Amber/Yellow (Độ 2)
      '#f97316', // Orange (Độ 3)
      '#ef4444', // Red (Độ 4)
      '#991b1b'  // Dark Maroon (Độ 5)
    ]
  };
}

/**
 * Thống kê so sánh độc tính theo phác đồ hóa trị
 */
export function getProtocolToxicityComparison(events: FlattenedToxicityEvent[]): ProtocolToxicitySummary[] {
  const protoMap = new Map<string, { total: number; patients: Set<string>; mild: number; severe: number }>();

  for (const ev of events) {
    const proto = ev.protocol || 'Khác';
    const existing = protoMap.get(proto) || { total: 0, patients: new Set(), mild: 0, severe: 0 };
    existing.total += 1;
    existing.patients.add(ev.patientDocId);
    if (ev.grade >= 3) {
      existing.severe += 1;
    } else {
      existing.mild += 1;
    }
    protoMap.set(proto, existing);
  }

  return Array.from(protoMap.entries())
    .map(([protocol, data]) => ({
      protocol,
      totalEvents: data.total,
      patientsCount: data.patients.size,
      mildCount: data.mild,
      severeCount: data.severe,
      severeRate: data.total > 0 ? Number(((data.severe / data.total) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.totalEvents - a.totalEvents);
}

/**
 * Trích xuất danh sách phác đồ có trong danh sách bệnh nhân
 */
export function extractUniqueProtocols(patients: PatientRecord[]): string[] {
  const set = new Set<string>();
  for (const p of patients || []) {
    if (p.protocol && p.protocol !== 'Chưa cập nhật') {
      set.add(p.protocol);
    }
    if (Array.isArray(p.cycles)) {
      for (const c of p.cycles) {
        if (c?.protocolUsed) set.add(c.protocolUsed);
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Truy vấn an toàn collection patients từ Firestore
 */
export async function fetchPatientsDataFromFirestore(
  db: Firestore
): Promise<{ success: boolean; data: PatientRecord[]; error: string | null }> {
  try {
    const q = query(collection(db, 'patients'));
    const snapshot = await getDocs(q);
    const patients: PatientRecord[] = [];
    snapshot.forEach(docSnap => {
      patients.push({ id: docSnap.id, ...docSnap.data() } as PatientRecord);
    });
    return { success: true, data: patients, error: null };
  } catch (error: any) {
    console.error('Lỗi khi tải dữ liệu bệnh nhân từ Firestore:', error);
    return {
      success: false,
      data: [],
      error: error?.message || 'Không thể kết nối đến Firestore hoặc không có quyền truy cập.'
    };
  }
}
