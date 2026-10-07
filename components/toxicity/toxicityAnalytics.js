/**
 * toxicityAnalytics.js
 * OncoCare Pro - CTCAE Toxicity Analytics Dashboard Renderer (ES Module / Vanilla JS)
 * 
 * Module hiển thị Dashboard thống kê độc tính hóa trị trực tiếp vào giao diện web OncoCare Pro.
 * Hoàn toàn tách biệt khỏi form nhập liệu CTCAE của bệnh nhân.
 */

import {
    extractFilteredToxicityEvents,
    calculateToxicityKPIs,
    getTopToxicities,
    getGradeDistribution,
    getProtocolToxicityComparison,
    extractUniqueProtocols,
    calculateDateRange
} from './toxicityStatsHelper.js';

// Lưu trữ các Chart.js instance để destroy khi re-render
let toxicityBarChartInstance = null;
let toxicityGradeChartInstance = null;
let toxicityProtocolChartInstance = null;

// State bộ lọc hiện tại
const currentFilters = {
    period: 'all',
    startDate: '',
    endDate: '',
    protocol: 'ALL',
    gradeFilter: 'all'
};

/**
 * Hàm khởi tạo và render Dashboard Độc tính vào một container DOM
 * @param {HTMLElement|string} container - Element hoặc selector của container
 * @param {Array} patientsList - Danh sách bệnh nhân (từ cachedPatientsList của OncoCare Pro)
 */
export function renderToxicityDashboard(container, patientsList = []) {
    try {
        const root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!root) {
            console.warn('[ToxicityAnalytics] Không tìm thấy container để render Dashboard.');
            return;
        }

        // Tự động đồng bộ các phác đồ vào dropdown
        const availableProtocols = extractUniqueProtocols(patientsList);

        // Trích xuất dữ liệu theo bộ lọc
        const { events, assessmentsCount, patientsCount } = extractFilteredToxicityEvents(patientsList, currentFilters);
        const kpis = calculateToxicityKPIs(events, assessmentsCount, patientsCount);
        const topToxicities = getTopToxicities(events, 7);
        const gradeData = getGradeDistribution(kpis);
        const protocolData = getProtocolToxicityComparison(events).slice(0, 8);
        const recentSevere = events.filter(e => e.isSevere).sort((a, b) => (b.assessmentDate || '').localeCompare(a.assessmentDate || '')).slice(0, 5);

        // Sinh HTML khung giao diện
        root.innerHTML = `
            <div class="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto pr-1 text-slate-800">
                <!-- 1. BỘ LỌC THỐNG KÊ ĐỘC TÍNH -->
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-bold text-slate-700 mr-1"><i class="fa-solid fa-filter text-teal-600 mr-1"></i>Thời gian:</span>
                        <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button type="button" data-period="all" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'all' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Tất cả</button>
                            <button type="button" data-period="this_month" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'this_month' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Tháng này</button>
                            <button type="button" data-period="last_month" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'last_month' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Tháng trước</button>
                            <button type="button" data-period="this_quarter" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'this_quarter' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Quý này</button>
                            <button type="button" data-period="this_year" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'this_year' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Năm nay</button>
                            <button type="button" data-period="custom" class="tox-period-btn px-2.5 py-1 rounded-md font-semibold transition ${currentFilters.period === 'custom' ? 'bg-white text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-teal-800'}">Tùy chọn ngày</button>
                        </div>

                        ${currentFilters.period === 'custom' ? `
                            <div class="flex items-center gap-1.5 ml-1">
                                <input type="date" id="toxStartDate" value="${currentFilters.startDate || ''}" class="p-1 px-2 bg-white border border-slate-300 rounded-md font-medium text-[11px]" />
                                <span class="text-slate-400">→</span>
                                <input type="date" id="toxEndDate" value="${currentFilters.endDate || ''}" class="p-1 px-2 bg-white border border-slate-300 rounded-md font-medium text-[11px]" />
                            </div>
                        ` : ''}
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <div class="flex items-center gap-1">
                            <label for="toxProtocolSelect" class="font-semibold text-slate-600">Phác đồ:</label>
                            <select id="toxProtocolSelect" class="p-1.5 px-2 bg-white border border-slate-300 rounded-lg text-teal-900 font-semibold text-xs focus:ring-1 focus:ring-teal-500">
                                <option value="ALL">Tất cả phác đồ (${availableProtocols.length})</option>
                                ${availableProtocols.map(proto => `<option value="${proto}" ${currentFilters.protocol === proto ? 'selected' : ''}>${proto}</option>`).join('')}
                            </select>
                        </div>

                        <button type="button" id="toxResetBtn" class="p-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-200 transition flex items-center gap-1" title="Xóa bộ lọc">
                            <i class="fa-solid fa-arrows-rotate text-slate-500"></i> Làm mới
                        </button>
                    </div>
                </div>

                <!-- 2. THẺ KPI TỔNG QUAN -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
                    <div class="bg-teal-50/70 border border-teal-200 p-3 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                            <p class="text-teal-700 font-semibold uppercase text-[11px]">Tổng Lượt Ghi Nhận Độc Tính</p>
                            <div class="flex items-baseline gap-1.5 mt-0.5">
                                <h4 class="text-2xl font-bold text-teal-900">${kpis.totalAssessments}</h4>
                                <span class="text-xs text-teal-700 font-medium">lượt (${kpis.totalPatientsWithToxicity} BN)</span>
                            </div>
                        </div>
                        <div class="w-9 h-9 bg-teal-200/70 rounded-full flex items-center justify-center text-teal-800 text-base">
                            <i class="fa-solid fa-clipboard-check"></i>
                        </div>
                    </div>

                    <div class="bg-sky-50/70 border border-sky-200 p-3 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                            <p class="text-sky-700 font-semibold uppercase text-[11px]">Tổng Biến Cố Độc Tính (AEs)</p>
                            <div class="flex items-baseline gap-1.5 mt-0.5">
                                <h4 class="text-2xl font-bold text-sky-900">${kpis.totalEvents}</h4>
                                <span class="text-xs text-sky-700 font-medium">biến cố</span>
                            </div>
                        </div>
                        <div class="w-9 h-9 bg-sky-200/70 rounded-full flex items-center justify-center text-sky-800 text-base">
                            <i class="fa-solid fa-bolt"></i>
                        </div>
                    </div>

                    <div class="bg-amber-50/80 border border-amber-200 p-3 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                            <p class="text-amber-800 font-semibold uppercase text-[11px]">Tỷ Lệ Độc Tính Nặng (≥ Độ 3)</p>
                            <div class="flex items-baseline gap-1.5 mt-0.5">
                                <h4 class="text-2xl font-bold text-amber-700">${kpis.severeEventsRate}%</h4>
                                <span class="text-xs font-bold text-amber-900">(${kpis.severeEventsCount} ca)</span>
                            </div>
                            <span class="text-[10px] text-amber-700 font-semibold block">Tạm hoãn / giảm liều hóa trị</span>
                        </div>
                        <div class="w-9 h-9 bg-amber-200/80 rounded-full flex items-center justify-center text-amber-800 text-base">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                    </div>

                    <div class="bg-rose-50/80 border border-rose-200 p-3 rounded-xl flex items-center justify-between shadow-sm">
                        <div>
                            <p class="text-rose-800 font-semibold uppercase text-[11px]">Nguy Kịch / Tử Vong (Độ 4-5)</p>
                            <div class="flex items-baseline gap-1.5 mt-0.5">
                                <h4 class="text-2xl font-bold text-rose-700">${kpis.criticalEventsCount}</h4>
                                <span class="text-xs font-bold text-rose-800">(${kpis.criticalEventsRate}%)</span>
                            </div>
                            <span class="text-[10px] text-rose-700 font-semibold block">Cần dừng thuốc / cấp cứu</span>
                        </div>
                        <div class="w-9 h-9 bg-rose-200/80 rounded-full flex items-center justify-center text-rose-800 text-base">
                            <i class="fa-solid fa-circle-radiation"></i>
                        </div>
                    </div>
                </div>

                <!-- 3. BIỂU ĐỒ HOẶC EMPTY STATE -->
                ${events.length === 0 ? `
                    <div class="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center my-4">
                        <div class="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-2">
                            <i class="fa-solid fa-magnifying-glass"></i>
                        </div>
                        <h4 class="font-bold text-slate-700 text-sm">Chưa có dữ liệu độc tính trong khoảng thời gian này</h4>
                        <p class="text-xs text-slate-500 max-w-sm mt-1 mb-3">Vui lòng thay đổi mốc thời gian hoặc chọn lại phác đồ để xem báo cáo.</p>
                        <button type="button" id="toxEmptyResetBtn" class="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold transition">Xem tất cả thời gian</button>
                    </div>
                ` : `
                    <!-- GRID 2 BIỂU ĐỒ CHÍNH -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
                        <!-- Biểu đồ cột ngang: Top độc tính (7 cols) -->
                        <div class="lg:col-span-7 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-bold text-xs uppercase text-slate-700 flex items-center gap-1.5">
                                    <i class="fa-solid fa-chart-bar text-teal-600"></i> Top Các Độc Tính CTCAE Thường Gặp Nhất
                                </h4>
                                <span class="text-[10px] bg-teal-50 text-teal-800 font-bold px-2 py-0.5 rounded border border-teal-200">Cột ngang</span>
                            </div>
                            <div class="flex-1 relative min-h-[260px]">
                                <canvas id="toxHorizontalBarChart"></canvas>
                            </div>
                        </div>

                        <!-- Biểu đồ phân bố độ nặng (5 cols) -->
                        <div class="lg:col-span-5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-bold text-xs uppercase text-slate-700 flex items-center gap-1.5">
                                    <i class="fa-solid fa-chart-pie text-amber-600"></i> Phân Bố Mức Độ Nặng CTCAE (Grade 1 - 5)
                                </h4>
                                <span class="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">Tỷ lệ %</span>
                            </div>
                            <div class="flex-1 relative min-h-[260px]">
                                <canvas id="toxGradeDoughnutChart"></canvas>
                            </div>
                        </div>

                        <!-- Biểu đồ so sánh độc tính theo phác đồ (12 cols) -->
                        <div class="lg:col-span-12 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-bold text-xs uppercase text-slate-700 flex items-center gap-1.5">
                                    <i class="fa-solid fa-layer-group text-indigo-600"></i> So Sánh Độc Tính Theo Phác Đồ Hóa Trị
                                </h4>
                                <span class="text-[10px] bg-indigo-50 text-indigo-800 font-bold px-2 py-0.5 rounded border border-indigo-200">Xếp chồng (Độ nhẹ vs Độ nặng)</span>
                            </div>
                            <div class="flex-1 relative min-h-[260px]">
                                <canvas id="toxProtocolChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- 4. DANH SÁCH CÁC CA ĐỘC TÍNH NẶNG GẦN ĐÂY -->
                    ${recentSevere.length > 0 ? `
                        <div class="bg-white p-3.5 rounded-xl border border-rose-200/90 shadow-sm shrink-0">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-bold text-xs uppercase text-rose-800 flex items-center gap-1.5">
                                    <i class="fa-solid fa-bell text-rose-600"></i> Các Ca Độc Tính Nặng Gần Đây Cần Bác Sĩ Lưu Ý (Grade ≥ 3)
                                </h4>
                                <span class="text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded border border-rose-200">${recentSevere.length} ca</span>
                            </div>
                            <div class="overflow-x-auto rounded-lg border border-slate-200">
                                <table class="w-full text-left text-xs text-slate-700">
                                    <thead class="bg-slate-100 text-slate-600 font-bold uppercase text-[11px]">
                                        <tr>
                                            <th class="p-2 text-center w-24">Ngày</th>
                                            <th class="p-2 w-48">Bệnh nhân</th>
                                            <th class="p-2 w-32">Phác đồ</th>
                                            <th class="p-2 w-48">Độc tính & Mức độ</th>
                                            <th class="p-2">Mô tả lâm sàng</th>
                                            <th class="p-2 text-center w-24">Hồ sơ</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-200">
                                        ${recentSevere.map(item => `
                                            <tr class="hover:bg-slate-50 transition">
                                                <td class="p-2 text-center font-mono font-medium">${item.assessmentDate}</td>
                                                <td class="p-2">
                                                    <span class="font-bold text-slate-900 block">${item.patientName}</span>
                                                    <span class="text-[11px] text-teal-800 font-mono">${item.patientCode}</span>
                                                </td>
                                                <td class="p-2 font-semibold text-slate-700">${item.protocol}</td>
                                                <td class="p-2">
                                                    <span class="font-bold text-slate-900 block">${item.organ}</span>
                                                    <span class="inline-block px-1.5 py-0.2 rounded font-bold text-[10px] ${item.grade >= 4 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
                                                        Độ ${item.grade} ${item.grade >= 4 ? '(Nguy kịch)' : '(Nặng)'}
                                                    </span>
                                                </td>
                                                <td class="p-2 text-slate-600 truncate max-w-xs" title="${item.description}">${item.description || '—'}</td>
                                                <td class="p-2 text-center">
                                                    <button type="button" onclick="window.viewPatientDetailById && window.viewPatientDetailById('${item.patientDocId}')" class="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded text-[11px] border border-teal-200 transition">
                                                        Xem
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                `}
            </div>
        `;

        // --------------------------------------------------------------------
        // GẮN SỰ KIỆN TƯƠNG TÁC CHO BỘ LỌC
        // --------------------------------------------------------------------
        // Nút chọn chu kỳ thời gian
        root.querySelectorAll('.tox-period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const period = target.dataset.period;
                currentFilters.period = period;
                if (period !== 'custom') {
                    currentFilters.startDate = '';
                    currentFilters.endDate = '';
                }
                renderToxicityDashboard(container, patientsList);
            });
        });

        // Input chọn ngày tùy chỉnh
        const startInput = root.querySelector('#toxStartDate');
        const endInput = root.querySelector('#toxEndDate');
        if (startInput) {
            startInput.addEventListener('change', (e) => {
                currentFilters.startDate = e.target.value;
                renderToxicityDashboard(container, patientsList);
            });
        }
        if (endInput) {
            endInput.addEventListener('change', (e) => {
                currentFilters.endDate = e.target.value;
                renderToxicityDashboard(container, patientsList);
            });
        }

        // Dropdown chọn phác đồ
        const protoSelect = root.querySelector('#toxProtocolSelect');
        if (protoSelect) {
            protoSelect.addEventListener('change', (e) => {
                currentFilters.protocol = e.target.value;
                renderToxicityDashboard(container, patientsList);
            });
        }

        // Nút reset bộ lọc
        const resetBtn = root.querySelector('#toxResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentFilters.period = 'all';
                currentFilters.startDate = '';
                currentFilters.endDate = '';
                currentFilters.protocol = 'ALL';
                renderToxicityDashboard(container, patientsList);
            });
        }
        const emptyResetBtn = root.querySelector('#toxEmptyResetBtn');
        if (emptyResetBtn) {
            emptyResetBtn.addEventListener('click', () => {
                currentFilters.period = 'all';
                currentFilters.startDate = '';
                currentFilters.endDate = '';
                currentFilters.protocol = 'ALL';
                renderToxicityDashboard(container, patientsList);
            });
        }

        // --------------------------------------------------------------------
        // VẼ CÁC BIỂU ĐỒ VỚI CHART.JS (NẾU CÓ DỮ LIỆU VÀ CHART ĐƯỢC LOAD)
        // --------------------------------------------------------------------
        if (events.length > 0 && typeof Chart !== 'undefined') {
            initToxicityCharts(topToxicities, gradeData, protocolData);
        }

    } catch (err) {
        console.error('[ToxicityAnalytics] Lỗi khi render Dashboard Độc tính:', err);
    }
}

/**
 * Khởi tạo 3 biểu đồ Chart.js
 */
function initToxicityCharts(topToxicities, gradeData, protocolData) {
    try {
        // Hủy các instance cũ nếu có
        if (toxicityBarChartInstance) {
            toxicityBarChartInstance.destroy();
            toxicityBarChartInstance = null;
        }
        if (toxicityGradeChartInstance) {
            toxicityGradeChartInstance.destroy();
            toxicityGradeChartInstance = null;
        }
        if (toxicityProtocolChartInstance) {
            toxicityProtocolChartInstance.destroy();
            toxicityProtocolChartInstance = null;
        }

        // 1. Biểu đồ cột ngang (Horizontal Bar Chart)
        const barCanvas = document.getElementById('toxHorizontalBarChart');
        if (barCanvas) {
            const ctx = barCanvas.getContext('2d');
            const labels = topToxicities.map(t => t.organ);
            const mildCounts = topToxicities.map(t => t.mildCount);
            const severeCounts = topToxicities.map(t => t.severeCount);

            toxicityBarChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Độ nhẹ (Grade 1-2)',
                            data: mildCounts,
                            backgroundColor: '#0d9488', // Teal
                            borderRadius: 4
                        },
                        {
                            label: 'Độ nặng (Grade 3-5)',
                            data: severeCounts,
                            backgroundColor: '#f43f5e', // Rose
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    indexAxis: 'y', // Biểu đồ cột ngang
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: { precision: 0, font: { size: 11 } }
                        },
                        y: {
                            stacked: true,
                            ticks: {
                                font: { size: 11, weight: '600' },
                                callback: function(value) {
                                    const label = this.getLabelForValue(value);
                                    return label.length > 25 ? label.slice(0, 25) + '…' : label;
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                afterBody: function(context) {
                                    const index = context[0].dataIndex;
                                    const item = topToxicities[index];
                                    return `Tổng số ca: ${item.totalCount} (${item.percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 2. Biểu đồ Doughnut phân bố mức độ nặng (Grade 1-5)
        const gradeCanvas = document.getElementById('toxGradeDoughnutChart');
        if (gradeCanvas) {
            const ctx = gradeCanvas.getContext('2d');
            toxicityGradeChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: gradeData.labels,
                    datasets: [{
                        data: gradeData.counts,
                        backgroundColor: gradeData.colors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 12, font: { size: 11 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const count = context.raw || 0;
                                    const pct = gradeData.percentages[context.dataIndex] || 0;
                                    return ` ${context.label}: ${count} ca (${pct}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }

        // 3. Biểu đồ xếp chồng theo phác đồ hóa trị
        const protoCanvas = document.getElementById('toxProtocolChart');
        if (protoCanvas) {
            const ctx = protoCanvas.getContext('2d');
            toxicityProtocolChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: protocolData.map(p => p.protocol),
                    datasets: [
                        {
                            label: 'Độ nhẹ (Grade 1-2)',
                            data: protocolData.map(p => p.mildCount),
                            backgroundColor: '#14b8a6', // Teal
                            borderRadius: 4
                        },
                        {
                            label: 'Độ nặng (Grade ≥ 3)',
                            data: protocolData.map(p => p.severeCount),
                            backgroundColor: '#e11d48', // Rose
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true,
                            ticks: { font: { size: 11, weight: '600' } }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: { precision: 0, font: { size: 11 } }
                        }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                afterBody: function(context) {
                                    const idx = context[0].dataIndex;
                                    const item = protocolData[idx];
                                    return `Tỷ lệ nặng: ${item.severeRate}% (${item.patientsCount} bệnh nhân)`;
                                }
                            }
                        }
                    }
                }
            });
        }

    } catch (err) {
        console.error('[ToxicityAnalytics] Lỗi khởi tạo biểu đồ Chart.js:', err);
    }
}

/**
 * Tự động resize các biểu đồ khi tab hiển thị
 */
export function resizeToxicityCharts() {
    if (toxicityBarChartInstance) toxicityBarChartInstance.resize();
    if (toxicityGradeChartInstance) toxicityGradeChartInstance.resize();
    if (toxicityProtocolChartInstance) toxicityProtocolChartInstance.resize();
}
