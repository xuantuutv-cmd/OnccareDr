/**
 * IhcManager.tsx
 * OncoCare Pro - Immunohistochemistry (IHC/HMMD) & History Log Timeline Component
 * 
 * Provides:
 * 1. IHC Subtype Selection for Breast Cancer (Luminal A, Luminal B HER2-, Luminal B HER2+, TNBC).
 * 2. History Log timeline display (IHC_UPDATE & MARKER_ADD).
 * 3. Safe integration without modifying existing marker input capabilities.
 */

import React, { useState } from 'react';
import { 
  BreastCancerSubtype, 
  IhcData, 
  PatientHistoryLog, 
  BREAST_CANCER_SUBTYPES 
} from './IhcTypes';

export interface IhcManagerProps {
  patientId: string;
  patientName: string;
  initialIhc?: IhcData | null;
  historyLogs?: PatientHistoryLog[];
  onSaveIhc: (ihcData: IhcData) => Promise<void>;
  isSaving?: boolean;
}

export const IhcManager: React.FC<IhcManagerProps> = ({
  patientId,
  patientName,
  initialIhc,
  historyLogs = [],
  onSaveIhc,
  isSaving = false
}) => {
  const [selectedSubtype, setSelectedSubtype] = useState<string>(initialIhc?.subtype || '');
  const [notes, setNotes] = useState<string>(initialIhc?.notes || '');
  const [filterType, setFilterType] = useState<'ALL' | 'IHC_UPDATE' | 'MARKER_ADD'>('ALL');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const activeSubtypeConfig = BREAST_CANCER_SUBTYPES.find(s => s.key === selectedSubtype);

  const filteredLogs = historyLogs.filter(log => {
    if (filterType === 'ALL') return true;
    return log.type === filterType;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubtype) {
      alert('Vui lòng chọn phân nhóm ung thư vú!');
      return;
    }

    const updatedIhc: IhcData = {
      subtype: selectedSubtype,
      notes: notes.trim(),
      updatedAt: new Date().toISOString()
    };

    try {
      await onSaveIhc(updatedIhc);
      setSaveSuccessMessage('Đã lưu thông tin Hóa mô miễn dịch (IHC) thành công!');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Lỗi khi lưu thông tin HMMD:', err);
    }
  };

  const formatDate = (isoString: string) => {
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
  };

  return (
    <div className="space-y-6 text-xs text-slate-800">
      {/* 1. KHUNG THÔNG TIN HÓA MÔ MIỄN DỊCH (IHC) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">HÓA MÔ MIỄN DỊCH (IHC / HMMD)</h4>
              <p className="text-[11px] text-slate-500">Phân nhóm sinh học dưới kính hiển vi của bệnh nhân: <strong className="text-slate-700">{patientName}</strong></p>
            </div>
          </div>
          {initialIhc?.subtype && (
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${activeSubtypeConfig?.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              Hiện tại: {initialIhc.subtype}
            </span>
          )}
        </div>

        {saveSuccessMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-semibold text-xs flex items-center gap-2 animate-fadeIn">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            {saveSuccessMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ihcSubtypeSelect" className="block font-bold text-slate-700 mb-1.5 uppercase text-[11px]">
              Chọn phân nhóm sinh học ung thư vú <span className="text-rose-500">*</span>
            </label>
            <select
              id="ihcSubtypeSelect"
              value={selectedSubtype}
              onChange={(e) => setSelectedSubtype(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none transition"
            >
              <option value="">-- Chọn phân nhóm HMMD --</option>
              {BREAST_CANCER_SUBTYPES.map((sub) => (
                <option key={sub.key} value={sub.key}>
                  {sub.label} ({sub.description})
                </option>
              ))}
            </select>
          </div>

          {/* Hiển thị card thông tin lâm sàng của phân nhóm được chọn */}
          {activeSubtypeConfig && (
            <div className={`p-3.5 rounded-xl border ${activeSubtypeConfig.borderClass} ${activeSubtypeConfig.bgClass} space-y-1.5`}>
              <div className="font-bold text-slate-900 text-xs flex items-center justify-between">
                <span>Đặc điểm: {activeSubtypeConfig.description}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activeSubtypeConfig.badgeClass}`}>
                  {activeSubtypeConfig.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-700">
                <strong className="text-slate-900">Hướng điều trị khuyến cáo:</strong> {activeSubtypeConfig.treatmentHint}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="ihcNotesInput" className="block font-semibold text-slate-600 mb-1">
              Ghi chú thêm (kết quả ER, PR, HER2, Ki-67 chi tiết nếu có):
            </label>
            <textarea
              id="ihcNotesInput"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: ER(+ 90%), PR(+ 80%), HER2 (3+), Ki-67: 15%..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSaving || !selectedSubtype}
              className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Đang lưu...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Lưu thông tin HMMD
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. DÒNG THỜI GIAN LỊCH SỬ THAO TÁC & DIỄN TIẾN (HISTORY LOG TIMELINE) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm uppercase">LỊCH SỬ DIỄN TIẾN & THAO TÁC</h4>
              <p className="text-[11px] text-slate-500">Ghi nhận tự động các thao tác HMMD & Marker ung thư</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition ${filterType === 'ALL' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Tất cả ({historyLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('IHC_UPDATE')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition ${filterType === 'IHC_UPDATE' ? 'bg-indigo-50 text-indigo-800 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              HMMD ({historyLogs.filter(l => l.type === 'IHC_UPDATE').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('MARKER_ADD')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition ${filterType === 'MARKER_ADD' ? 'bg-teal-50 text-teal-800 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Marker ({historyLogs.filter(l => l.type === 'MARKER_ADD').length})
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-1">
            <svg className="w-8 h-8 mx-auto text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 8v4l3 3"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <p className="font-medium text-xs text-slate-500">Chưa có lịch sử thao tác nào được ghi nhận.</p>
            <p className="text-[11px] text-slate-400">Các thay đổi HMMD và chỉ số Marker mới sẽ tự động hiển thị theo timeline tại đây.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {filteredLogs.map((log) => {
              const isIhc = log.type === 'IHC_UPDATE';
              return (
                <div key={log.id} className="relative group">
                  {/* Timeline node icon */}
                  <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center shrink-0 ${isIhc ? 'border-indigo-600 text-indigo-600' : 'border-teal-600 text-teal-600'}`}>
                    {isIhc ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                    )}
                  </div>

                  <div className={`p-3 rounded-xl border transition ${isIhc ? 'bg-indigo-50/40 border-indigo-200/70 hover:border-indigo-300' : 'bg-teal-50/40 border-teal-200/70 hover:border-teal-300'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isIhc ? 'bg-indigo-100 text-indigo-900 border-indigo-300' : 'bg-teal-100 text-teal-900 border-teal-300'}`}>
                        {isIhc ? 'CẬP NHẬT HMMD' : 'THÊM MARKER'}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>

                    <p className="font-semibold text-slate-800 text-xs leading-relaxed">
                      {log.description}
                    </p>

                    {log.performedBy && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Thực hiện bởi: <span className="font-medium text-slate-600">{log.performedBy}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default IhcManager;
