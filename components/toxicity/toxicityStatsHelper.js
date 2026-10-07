/**
 * toxicityStatsHelper.js
 * OncoCare Pro - Chemotherapy CTCAE Toxicity Analytics Helper (ES Module / Vanilla JS)
 * 
 * Module tính toán và tổng hợp số liệu độc tính hóa trị CTCAE.
 * Thiết kế an toàn 100%: Chỉ đọc dữ liệu, không ghi đè, không thay đổi Firestore.
 */

/**
 * Tính ngày bắt đầu và kết thúc theo chu kỳ thời gian
 * @param {string} period 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'
 * @returns {{ startDate: string, endDate: string }}
 */
export function calculateDateRange(period) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const formatIso = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    switch (period) {
        case 'this_month': {
            const first = new Date(year, month, 1);
            const last = new Date(year, month + 1, 0);
            return { startDate: formatIso(first), endDate: formatIso(last) };
        }
        case 'last_month': {
            const first = new Date(year, month - 1, 1);
            const last = new Date(year, month, 0);
            return { startDate: formatIso(first), endDate: formatIso(last) };
        }
        case 'this_quarter': {
            const qMonth = Math.floor(month / 3) * 3;
            const first = new Date(year, qMonth, 1);
            const last = new Date(year, qMonth + 3, 0);
            return { startDate: formatIso(first), endDate: formatIso(last) };
        }
        case 'this_year': {
            const first = new Date(year, 0, 1);
            const last = new Date(year, 11, 31);
            return { startDate: formatIso(first), endDate: formatIso(last) };
        }
        case 'all':
        default:
            return { startDate: '', endDate: '' };
    }
}

/**
 * Xác định phác đồ của bệnh nhân tại thời điểm đánh giá
 * @param {Object} patient 
 * @param {string} assessmentDate 
 * @returns {string}
 */
export function resolveProtocolForAssessment(patient, assessmentDate) {
    if (Array.isArray(patient?.cycles) && patient.cycles.length > 0) {
        const sorted = [...patient.cycles].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const matched = [...sorted].reverse().find(c => c && c.date && c.date <= assessmentDate);
        if (matched && matched.protocolUsed) return matched.protocolUsed;
        const first = sorted.find(c => c && c.protocolUsed);
        if (first?.protocolUsed) return first.protocolUsed;
    }
    return patient?.protocol || 'Chưa cập nhật';
}

/**
 * Trích xuất danh sách biến cố độc tính phẳng theo bộ lọc
 * @param {Array} patients 
 * @param {Object} criteria 
 * @returns {{ events: Array, assessmentsCount: number, patientsCount: number }}
 */
export function extractFilteredToxicityEvents(patients, criteria = {}) {
    try {
        let startDate = criteria.startDate || '';
        let endDate = criteria.endDate || '';

        if (criteria.period && criteria.period !== 'custom' && criteria.period !== 'all') {
            const range = calculateDateRange(criteria.period);
            startDate = range.startDate;
            endDate = range.endDate;
        }

        const events = [];
        const matchedAssessments = new Set();
        const matchedPatients = new Set();

        for (const patient of (patients || [])) {
            const assessments = patient.toxicityAssessments || [];
            if (!Array.isArray(assessments) || assessments.length === 0) continue;

            for (const assessment of assessments) {
                const date = assessment.date || '';

                if (startDate && date < startDate) continue;
                if (endDate && date > endDate) continue;

                const protocol = resolveProtocolForAssessment(patient, date);

                if (criteria.protocol && criteria.protocol !== 'ALL') {
                    if (protocol.toLowerCase().trim() !== criteria.protocol.toLowerCase().trim()) {
                        continue;
                    }
                }

                const items = assessment.items || [];
                if (!Array.isArray(items) || items.length === 0) continue;

                let hasItem = false;
                for (const item of items) {
                    const grade = Number(item.grade) || 0;
                    if (grade < 1) continue;

                    if (criteria.gradeFilter === 'severe' && grade < 3) continue;
                    if (criteria.gradeFilter === 'critical' && grade < 4) continue;

                    hasItem = true;
                    events.push({
                        patientDocId: patient.id,
                        patientCode: patient.patientId || (patient.id ? patient.id.slice(0, 6) : ''),
                        patientName: patient.name || 'Không có tên',
                        protocol,
                        assessmentDate: date,
                        recordedAt: assessment.recordedAt,
                        organ: item.organ || 'Độc tính khác',
                        grade,
                        description: item.description || '',
                        isSevere: grade >= 3,
                        isCritical: grade >= 4
                    });
                }

                if (hasItem) {
                    matchedAssessments.add(`${patient.id}_${date}_${assessment.recordedAt || ''}`);
                    matchedPatients.add(patient.id);
                }
            }
        }

        return {
            events,
            assessmentsCount: matchedAssessments.size,
            patientsCount: matchedPatients.size
        };
    } catch (err) {
        console.error('Lỗi khi trích xuất dữ liệu độc tính:', err);
        return { events: [], assessmentsCount: 0, patientsCount: 0 };
    }
}

/**
 * Tính toán KPI tổng quan
 * @param {Array} events 
 * @param {number} assessmentsCount 
 * @param {number} patientsCount 
 * @returns {Object}
 */
export function calculateToxicityKPIs(events, assessmentsCount, patientsCount) {
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

    return {
        totalAssessments: assessmentsCount,
        totalPatientsWithToxicity: patientsCount,
        totalEvents,
        severeEventsCount,
        severeEventsRate: totalEvents > 0 ? Number(((severeEventsCount / totalEvents) * 100).toFixed(1)) : 0,
        criticalEventsCount,
        criticalEventsRate: totalEvents > 0 ? Number(((criticalEventsCount / totalEvents) * 100).toFixed(1)) : 0,
        grade1Count: g1,
        grade2Count: g2,
        grade3Count: g3,
        grade4Count: g4,
        grade5Count: g5
    };
}

/**
 * Top độc tính thường gặp nhất (Horizontal Bar Chart)
 * @param {Array} events 
 * @param {number} limit 
 * @returns {Array}
 */
export function getTopToxicities(events, limit = 7) {
    const organMap = new Map();

    for (const ev of events) {
        const item = organMap.get(ev.organ) || { total: 0, mild: 0, severe: 0 };
        item.total++;
        if (ev.grade >= 3) item.severe++;
        else item.mild++;
        organMap.set(ev.organ, item);
    }

    const totalEvents = events.length || 1;
    return Array.from(organMap.entries())
        .map(([organ, data]) => ({
            organ,
            totalCount: data.total,
            mildCount: data.mild,
            severeCount: data.severe,
            percentage: Number(((data.total / totalEvents) * 100).toFixed(1))
        }))
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, limit);
}

/**
 * Phân bố mức độ nặng CTCAE
 * @param {Object} kpis 
 * @returns {Object}
 */
export function getGradeDistribution(kpis) {
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
        colors: ['#38bdf8', '#fbbf24', '#f97316', '#ef4444', '#991b1b']
    };
}

/**
 * So sánh độc tính theo phác đồ hóa trị
 * @param {Array} events 
 * @returns {Array}
 */
export function getProtocolToxicityComparison(events) {
    const protoMap = new Map();

    for (const ev of events) {
        const proto = ev.protocol || 'Khác';
        const item = protoMap.get(proto) || { total: 0, patients: new Set(), mild: 0, severe: 0 };
        item.total++;
        item.patients.add(ev.patientDocId);
        if (ev.grade >= 3) item.severe++;
        else item.mild++;
        protoMap.set(proto, item);
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
 * Trích xuất danh sách tất cả các phác đồ
 * @param {Array} patients 
 * @returns {Array<string>}
 */
export function extractUniqueProtocols(patients) {
    const set = new Set();
    for (const p of (patients || [])) {
        if (p.protocol && p.protocol !== 'Chưa cập nhật') set.add(p.protocol);
        if (Array.isArray(p.cycles)) {
            for (const c of p.cycles) {
                if (c?.protocolUsed) set.add(c.protocolUsed);
            }
        }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}
