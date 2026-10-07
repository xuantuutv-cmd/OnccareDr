/**
 * ToxicityAnalytics.tsx
 * OncoCare Pro - Chemotherapy CTCAE Toxicity Analytics Dashboard Component
 * 
 * Component độc lập hiển thị Dashboard thống kê độc tính hóa trị CTCAE.
 * Tuân thủ quy tắc bảo mật & phân tách:
 * - Không chỉnh sửa các form nhập liệu CTCAE hiện tại.
 * - Chỉ đọc dữ liệu từ Firestore hoặc nhận prop patientsList từ cache.
 * - Có đầy đủ trạng thái Loading, Empty state, Error fallback.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  PatientRecord,
  ToxicityFilterCriteria,
  TimeFilterPeriod,
  extractFilteredToxicityEvents,
  calculateToxicityKPIs,
  getTopToxicities,
  getGradeDistribution,
  getProtocolToxicityComparison,
  extractUniqueProtocols,
  fetchPatientsDataFromFirestore
} from './toxicityStatsHelper';

interface ToxicityAnalyticsProps {
  /** Danh sách bệnh nhân đã được cache sẵn từ ứng dụng chính (nếu có) */
  cachedPatients?: PatientRecord[];
  /** Firestore instance để tự fetch dữ liệu nếu không truyền cachedPatients */
  firestoreDb?: any;
  /** Callback khi người dùng muốn xem chi tiết hồ sơ bệnh nhân */
  onViewPatientDetail?: (patientId: string) => void;
  /** Cho phép đóng modal / tab nếu đang nằm trong dialog */
  onClose?: () => void;
}

export const ToxicityAnalytics: React.FC<ToxicityAnalyticsProps> = ({
  cachedPatients,
  firestoreDb,
  onViewPatientDetail,
  onClose
}) => {
  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  const [patients, setPatients] = useState<PatientRecord[]>(cachedPatients || []);
  const [loading, setLoading] = useState<boolean>(!cachedPatients || cachedPatients.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Bộ lọc
  const [filterCriteria, setFilterCriteria] = useState<ToxicityFilterCriteria>({
    period: 'all',
    startDate: '',
    endDate: '',
    protocol: 'ALL',
    gradeFilter: 'all'
  });

  // Tải dữ liệu từ Firestore nếu chưa có cache
  useEffect(() => {
    if (cachedPatients && cachedPatients.length > 0) {
      setPatients(cachedPatients);
      setLoading(false);
      return;
    }

    if (!firestoreDb) {
      // Khi không có Firestore instance và không có cache
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadData = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const result = await fetchPatientsDataFromFirestore(firestoreDb);
        if (!isMounted) return;

        if (result.success) {
          setPatients(result.data);
        } else {
          setErrorMessage(result.error);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.message || 'Lỗi không xác định khi truy vấn Firestore');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [cachedPatients, firestoreDb]);

  // Cập nhật patients khi cachedPatients bên ngoài thay đổi
  useEffect(() => {
    if (cachedPatients && cachedPatients.length > 0) {
      setPatients(cachedPatients);
      setLoading(false);
    }
  }, [cachedPatients]);

  // Danh sách các phác đồ có trong data
  const availableProtocols = useMemo(() => {
    return extractUniqueProtocols(patients);
  }, [patients]);

  // Lọc và tính toán số liệu
  const { filteredEvents, assessmentsCount, patientsCount } = useMemo(() => {
    return extractFilteredToxicityEvents(patients, filterCriteria);
  }, [patients, filterCriteria]);

  const kpis = useMemo(() => {
    return calculateToxicityKPIs(filteredEvents, assessmentsCount, patientsCount);
  }, [filteredEvents, assessmentsCount, patientsCount]);

  const topToxicities = useMemo(() => {
    return getTopToxicities(filteredEvents, 6);
  }, [filteredEvents]);

  const gradeDistribution = useMemo(() => {
    return getGradeDistribution(kpis);
  }, [kpis]);

  const protocolComparison = useMemo(() => {
    return getProtocolToxicityComparison(filteredEvents).slice(0, 6);
  }, [filteredEvents]);

  // Lấy danh sách 5 biến cố độ 3-5 gần đây nhất để hiển thị cảnh báo lâm sàng
  const recentSevereEvents = useMemo(() => {
    return filteredEvents
      .filter(ev => ev.isSevere)
      .sort((a, b) => (b.assessmentDate || '').localeCompare(a.assessmentDate || ''))
      .slice(0, 5);
  }, [filteredEvents]);

  // Xử lý thay đổi bộ lọc chu kỳ
  const handlePeriodChange = (period: TimeFilterPeriod) => {
    setFilterCriteria(prev => ({
      ...prev,
      period,
      startDate: period === 'custom' ? prev.startDate : '',
      endDate: period === 'custom' ? prev.endDate : ''
    }));
  };

  const handleResetFilters = () => {
    setFilterCriteria({
      period: 'all',
      startDate: '',
      endDate: '',
      protocol: 'ALL',
      gradeFilter: 'all'
    });
  };

  // --------------------------------------------------------------------------
  // RENDER: LOADING STATE
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="w-full min-h-[420px] bg-slate-50/50 rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 border border-slate-200">
        <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-800">Đang tổng hợp dữ liệu độc tính CTCAE...</p>
          <p className="text-xs text-slate-500 mt-1">Đang truy vấn hồ sơ bệnh nhân và tính toán chỉ số thống kê.</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: ERROR STATE
  // --------------------------------------------------------------------------
  if (errorMessage) {
    return (
      <div className="w-full bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-900 my-4 shadow-sm">
        <div className="w-12 h-12 mx-auto bg-rose-100 rounded-full flex items-center justify-center text-rose-600 text-xl font-bold mb-3">
          ⚠️
        </div>
        <h4 className="font-bold text-base mb-1">Không thể tải dữ liệu thống kê độc tính</h4>
        <p className="text-xs text-rose-700 max-w-md mx-auto mb-4">{errorMessage}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow"
        >
          Tải lại trang
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-50 text-slate-800 rounded-2xl flex flex-col space-y-5 p-4 sm:p-6 overflow-hidden">
      {/* -------------------------------------------------------------------- */}
      {/* 1. HEADER & CONTROLS */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white flex items-center justify-center shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
                Dashboard Thống Kê Độc Tính Hóa Trị
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-200 uppercase">
                CTCAE v5.0
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Phân tích giám sát an toàn hóa trị, tỷ lệ độc tính nặng & phân bố theo phác đồ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            title="Làm mới bộ lọc"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Tất cả
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              Đóng
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. FILTER TOOLBAR */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        {/* Khoảng thời gian nhanh */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => handlePeriodChange('all')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'all'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('this_month')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'this_month'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Tháng này
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('last_month')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'last_month'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Tháng trước
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('this_quarter')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'this_quarter'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Quý này
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('this_year')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'this_year'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Năm nay
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('custom')}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              filterCriteria.period === 'custom'
                ? 'bg-white text-teal-800 shadow-sm font-bold'
                : 'text-slate-600 hover:text-teal-800'
            }`}
          >
            Tùy chọn ngày
          </button>
        </div>

        {/* Tùy chọn ngày bắt đầu & kết thúc */}
        {filterCriteria.period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterCriteria.startDate || ''}
              onChange={e => setFilterCriteria(prev => ({ ...prev, startDate: e.target.value }))}
              className="p-1.5 px-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none"
            />
            <span className="text-slate-400 font-bold">→</span>
            <input
              type="date"
              value={filterCriteria.endDate || ''}
              onChange={e => setFilterCriteria(prev => ({ ...prev, endDate: e.target.value }))}
              className="p-1.5 px-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none"
            />
          </div>
        )}

        {/* Lọc theo Phác đồ */}
        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <label className="text-slate-600 font-semibold whitespace-nowrap">Phác đồ:</label>
          <select
            value={filterCriteria.protocol || 'ALL'}
            onChange={e => setFilterCriteria(prev => ({ ...prev, protocol: e.target.value }))}
            className="p-1.5 px-2.5 bg-white border border-slate-300 rounded-lg text-teal-900 font-semibold focus:ring-1 focus:ring-teal-500 focus:outline-none"
          >
            <option value="ALL">Tất cả phác đồ ({availableProtocols.length})</option>
            {availableProtocols.map(proto => (
              <option key={proto} value={proto}>
                {proto}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc theo Mức độ độc tính */}
        <div className="flex items-center gap-1.5">
          <label className="text-slate-600 font-semibold whitespace-nowrap">Mức độ:</label>
          <select
            value={filterCriteria.gradeFilter || 'all'}
            onChange={e => setFilterCriteria(prev => ({ ...prev, gradeFilter: e.target.value as any }))}
            className="p-1.5 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none"
          >
            <option value="all">Tất cả mức độ (Độ 1 - 5)</option>
            <option value="severe">⚠ Chỉ độc tính nặng (Độ ≥ 3)</option>
            <option value="critical">❗ Nguy kịch (Độ 4 - 5)</option>
          </select>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. KPI CARDS OVERVIEW */}
      {/* -------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Tổng số ca ghi nhận */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-center justify-between relative overflow-hidden group hover:border-teal-300 transition">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
              Lượt Ghi Nhận Độc Tính
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {kpis.totalAssessments}
              </span>
              <span className="text-[12px] font-medium text-slate-500">
                lượt ({kpis.totalPatientsWithToxicity} BN)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Từ dữ liệu CTCAE hồ sơ bệnh nhân
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg border border-teal-100 group-hover:scale-105 transition-transform">
            📋
          </div>
        </div>

        {/* Card 2: Tổng số biến cố phát hiện */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex items-center justify-between relative overflow-hidden group hover:border-sky-300 transition">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Tổng Biến Cố Độc Tính (AEs)
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {kpis.totalEvents}
              </span>
              <span className="text-[12px] font-medium text-slate-500">
                biến cố
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Bao gồm độ 1 đến độ 5
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-lg border border-sky-100 group-hover:scale-105 transition-transform">
            ⚡
          </div>
        </div>

        {/* Card 3: Tỷ lệ độc tính nặng (Grade >= 3) */}
        <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-sm flex items-center justify-between relative overflow-hidden group hover:border-amber-400 transition bg-gradient-to-br from-white to-amber-50/30">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
              <span>⚠ Tỷ Lệ Độc Tính Nặng (≥ Độ 3)</span>
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-700">
                {kpis.severeEventsRate}%
              </span>
              <span className="text-[12px] font-bold text-amber-900">
                ({kpis.severeEventsCount} ca)
              </span>
            </div>
            <p className="text-[11px] text-amber-700 font-medium">
              Cần tạm hoãn / giảm liều hóa trị
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg border border-amber-200 group-hover:scale-105 transition-transform">
            ⚠️
          </div>
        </div>

        {/* Card 4: Độc tính nguy kịch (Grade >= 4) */}
        <div className="bg-white p-4 rounded-xl border border-rose-200/80 shadow-sm flex items-center justify-between relative overflow-hidden group hover:border-rose-400 transition bg-gradient-to-br from-white to-rose-50/40">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
              <span>❗ Nguy Kịch / Tử Vong (Độ 4-5)</span>
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-700">
                {kpis.criticalEventsCount}
              </span>
              <span className="text-[12px] font-bold text-rose-800">
                ({kpis.criticalEventsRate}%)
              </span>
            </div>
            <p className="text-[11px] text-rose-700 font-medium">
              Chỉ định ngừng thuốc / cấp cứu
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center text-lg border border-rose-200 group-hover:scale-105 transition-transform">
            🚨
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. MAIN CHARTS GRID (EMPTY STATE OR VISUALIZATIONS) */}
      {/* -------------------------------------------------------------------- */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center flex flex-col items-center justify-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-3">
            🔍
          </div>
          <h3 className="font-bold text-base text-slate-700">Không có dữ liệu độc tính trong khoảng lọc</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
            Không tìm thấy lần đánh giá CTCAE nào phù hợp với bộ lọc thời gian hoặc phác đồ hiện tại.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow transition"
          >
            Xóa bộ lọc & Xem toàn bộ
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* BIỂU ĐỒ 1: TOP ĐỘC TÍNH THƯỜNG GẶP (HORIZONTAL BAR CHART) - 7 COLS */}
          <div className="lg:col-span-7 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span>
                    Top Các Độc Tính Thường Gặp Nhất
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Phân bố số ca & tỷ lệ phân tầng Nhẹ (Độ 1-2) vs Nặng (Độ ≥ 3)
                  </p>
                </div>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                  Cột ngang
                </span>
              </div>

              {/* Danh sách thanh ngang */}
              <div className="space-y-3.5 pt-1">
                {topToxicities.map((item, idx) => {
                  const maxCount = topToxicities[0]?.totalCount || 1;
                  const barWidthPercent = Math.min(100, Math.round((item.totalCount / maxCount) * 100));
                  const severeRatio = item.totalCount > 0 ? (item.severeCount / item.totalCount) * 100 : 0;

                  return (
                    <div key={item.organ} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[280px] sm:max-w-[340px]" title={item.organ}>
                          <span className="text-slate-400 font-mono mr-1.5">#{idx + 1}</span>
                          {item.organ}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-bold text-slate-800">{item.totalCount} ca</span>
                          <span className="text-slate-400">({item.percentage}%)</span>
                          {item.severeCount > 0 && (
                            <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 text-[10px]">
                              {item.severeCount} nặng
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Thanh biểu đồ kép: Phần nhẹ (Teal) và phần nặng (Amber/Rose) */}
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/50">
                        <div
                          style={{ width: `${barWidthPercent}%` }}
                          className="h-full flex rounded-full overflow-hidden transition-all duration-500"
                        >
                          {/* Mild bar (Độ 1-2) */}
                          <div
                            style={{ width: `${100 - severeRatio}%` }}
                            className="h-full bg-teal-500 hover:bg-teal-600 transition"
                            title={`Độ nhẹ 1-2: ${item.mildCount} ca`}
                          />
                          {/* Severe bar (Độ 3-5) */}
                          <div
                            style={{ width: `${severeRatio}%` }}
                            className="h-full bg-rose-500 hover:bg-rose-600 transition"
                            title={`Độ nặng ≥3: ${item.severeCount} ca`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chú thích biểu đồ cột ngang */}
            <div className="flex items-center justify-end gap-4 pt-4 mt-3 border-t border-slate-100 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block"></span>
                <span>Độ nhẹ 1–2 ({kpis.grade1Count + kpis.grade2Count} ca)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
                <span className="font-bold text-rose-700">Độ nặng 3–5 ({kpis.severeEventsCount} ca)</span>
              </div>
            </div>
          </div>

          {/* BIỂU ĐỒ 2: PHÂN BỐ MỨC ĐỘ NẶNG CTCAE (GRADE 1 - 5) - 5 COLS */}
          <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                    Phân Bố Mức Độ Nặng CTCAE
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tỷ lệ % các cấp độ theo tiêu chuẩn lâm sàng
                  </p>
                </div>
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  Grade 1–5
                </span>
              </div>

              {/* Progress stack tổng hợp */}
              <div className="w-full h-4 rounded-xl overflow-hidden flex shadow-inner border border-slate-200 mb-4">
                {gradeDistribution.counts.map((count, i) => {
                  if (count === 0) return null;
                  const pct = gradeDistribution.percentages[i];
                  return (
                    <div
                      key={i}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: gradeDistribution.colors[i]
                      }}
                      className="h-full transition-all duration-500"
                      title={`${gradeDistribution.labels[i]}: ${count} ca (${pct}%)`}
                    />
                  );
                })}
              </div>

              {/* Bảng phân tầng chi tiết */}
              <div className="space-y-2 text-xs">
                {gradeDistribution.labels.map((label, i) => {
                  const count = gradeDistribution.counts[i];
                  const pct = gradeDistribution.percentages[i];
                  const color = gradeDistribution.colors[i];

                  return (
                    <div
                      key={label}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 hover:bg-slate-100/60 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-medium text-slate-700">{label}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="font-bold text-slate-800">{count} ca</span>
                        <span className="text-slate-500 text-[11px] w-12 text-right font-semibold">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mt-4 text-[11px] text-amber-900 leading-relaxed">
              <strong className="font-bold">Khuyến cáo:</strong> Độ 3 yêu cầu tạm hoãn chu kỳ và cân nhắc giảm liều; Độ 4-5 bắt buộc ngừng thuốc nghi ngờ và cấp cứu chuyên sâu.
            </div>
          </div>

          {/* BIỂU ĐỒ 3: SO SÁNH ĐỘC TÍNH THEO PHÁC ĐỒ HÓA TRỊ - 12 COLS */}
          <div className="lg:col-span-12 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                  So Sánh Độc Tính Theo Phác Đồ Hóa Trị
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tần suất xuất hiện biến cố và tỷ lệ độc tính nặng giữa các phác đồ
                </p>
              </div>
              <span className="text-[11px] text-indigo-800 bg-indigo-50 font-bold px-2 py-0.5 rounded-md border border-indigo-200 self-start sm:self-auto">
                {protocolComparison.length} phác đồ hàng đầu
              </span>
            </div>

            {protocolComparison.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-6">Không có dữ liệu phác đồ tương ứng.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {protocolComparison.map(proto => (
                  <div
                    key={proto.protocol}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-300 transition flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 text-xs truncate block" title={proto.protocol}>
                          {proto.protocol}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {proto.patientsCount} bệnh nhân điều trị
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                        {proto.totalEvents} biến cố
                      </span>
                    </div>

                    {/* Thanh tỷ lệ so sánh giữa nhẹ và nặng */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-medium text-slate-600">
                        <span>Nhẹ (Độ 1-2): <strong className="text-teal-700">{proto.mildCount}</strong></span>
                        <span>Nặng (≥Độ 3): <strong className="text-rose-700">{proto.severeCount}</strong></span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                        <div
                          style={{
                            width: `${proto.totalEvents > 0 ? (proto.mildCount / proto.totalEvents) * 100 : 0}%`
                          }}
                          className="h-full bg-teal-500"
                          title={`Độ 1-2: ${proto.mildCount}`}
                        />
                        <div
                          style={{
                            width: `${proto.totalEvents > 0 ? (proto.severeCount / proto.totalEvents) * 100 : 0}%`
                          }}
                          className="h-full bg-rose-500"
                          title={`Độ ≥3: ${proto.severeCount}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                      <span className="text-slate-500">Tỷ lệ độc tính nặng:</span>
                      <span
                        className={`font-bold font-mono px-1.5 py-0.2 rounded ${
                          proto.severeRate >= 30
                            ? 'bg-rose-100 text-rose-800'
                            : proto.severeRate >= 15
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {proto.severeRate}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. BẢNG CẢNH BÁO ĐỘC TÍNH NẶNG CẦN LƯU Ý GẦN ĐÂY */}
          {recentSevereEvents.length > 0 && (
            <div className="lg:col-span-12 bg-white p-4 sm:p-5 rounded-2xl border border-rose-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm text-rose-900 flex items-center gap-2">
                  <span>🚨</span> Các Trường Hợp Độc Tính Nặng Gần Đây Cần Theo Dõi (Grade ≥ 3)
                </h3>
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {recentSevereEvents.length} ca gần nhất
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px]">
                    <tr>
                      <th className="p-2.5 pl-3">Ngày</th>
                      <th className="p-2.5">Mã BN / Tên</th>
                      <th className="p-2.5">Phác đồ</th>
                      <th className="p-2.5">Độc tính & Mức độ</th>
                      <th className="p-2.5">Mô tả / Lâm sàng</th>
                      <th className="p-2.5 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {recentSevereEvents.map((ev, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="p-2.5 pl-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                          {ev.assessmentDate}
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900 block">{ev.patientName}</span>
                          <span className="text-[11px] text-teal-800 font-mono">{ev.patientCode}</span>
                        </td>
                        <td className="p-2.5 font-semibold text-slate-700">
                          {ev.protocol}
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900 block">{ev.organ}</span>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded font-bold text-[10px] ${
                              ev.grade >= 4
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            Độ {ev.grade} {ev.grade >= 4 ? '(Nguy kịch)' : '(Nặng)'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 max-w-xs truncate" title={ev.description}>
                          {ev.description || 'Chưa ghi chú mô tả'}
                        </td>
                        <td className="p-2.5 text-center">
                          {onViewPatientDetail && (
                            <button
                              type="button"
                              onClick={() => onViewPatientDetail(ev.patientDocId)}
                              className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded text-[11px] border border-teal-200 transition"
                            >
                              Xem hồ sơ
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToxicityAnalytics;
