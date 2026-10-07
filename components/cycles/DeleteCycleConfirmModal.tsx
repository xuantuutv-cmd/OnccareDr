/**
 * DeleteCycleConfirmModal.tsx
 * OncoCare Pro - Custom Confirmation Modal for Deleting Treatment Cycles
 * 
 * Replaces the native browser confirm() dialog with a modern, state-driven,
 * accessible modal matching the exact design language of OncoCare Pro.
 */

import React, { useEffect, useCallback } from 'react';

export interface TreatmentCycleInfo {
  index: number;
  branchName?: string;
  cycleNumber?: number;
  date?: string;
  protocolUsed?: string;
  drugNames?: string;
  doseInput?: string;
  note?: string;
}

export interface DeleteCycleConfirmModalProps {
  isOpen: boolean;
  cycle?: TreatmentCycleInfo | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isDeleting?: boolean;
}

export const DeleteCycleConfirmModal: React.FC<DeleteCycleConfirmModalProps> = ({
  isOpen,
  cycle,
  onConfirm,
  onCancel,
  isDeleting = false
}) => {
  // Handle Escape key to close modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    },
    [isDeleting, onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Format date dd/mm/yyyy
  const formatDisplayDate = (isoStr?: string) => {
    if (!isoStr) return 'Chưa cập nhật';
    const match = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return isoStr;
  };

  const cycleTitle = cycle?.branchName || (cycle?.cycleNumber ? `Chu kỳ ${cycle.cycleNumber}` : 'Chu kỳ điều trị');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deleteCycleModalTitle"
      className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={e => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
    >
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-[#3c4043] flex flex-col overflow-hidden animate-fadeIn m-auto text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="bg-slate-900 dark:bg-[#2b2b2b] text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-slate-800 dark:border-[#3c4043]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center border border-rose-400/30">
              <i className="fa-solid fa-triangle-exclamation text-rose-400 text-sm"></i>
            </div>
            <div>
              <h3 id="deleteCycleModalTitle" className="font-bold text-sm uppercase tracking-wide">
                Xác nhận xóa chu kỳ
              </h3>
              <p className="text-slate-400 text-[12px] mt-0.5">Xóa vĩnh viễn chu kỳ điều trị khỏi hồ sơ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            title="Đóng"
            aria-label="Đóng cửa sổ"
            className="w-7 h-7 rounded-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Warning banner */}
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-900 dark:text-rose-200 text-xs font-medium flex items-start gap-3">
            <i className="fa-solid fa-circle-exclamation text-rose-600 dark:text-rose-400 mt-0.5 text-base shrink-0"></i>
            <div className="space-y-1">
              <p className="font-bold text-[13px] text-rose-950 dark:text-rose-100">Hành động này không thể hoàn tác!</p>
              <p className="text-rose-800 dark:text-rose-300 leading-relaxed">
                Bạn có chắc chắn muốn xóa chu kỳ này không? Dữ liệu liều dùng, phác đồ và ghi chú của chu kỳ sẽ bị xóa khỏi hồ sơ bệnh nhân.
              </p>
            </div>
          </div>

          {/* Cycle Info Box */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#3c4043] rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Chu kỳ:</span>
              <strong className="text-slate-900 dark:text-white font-bold">{cycleTitle}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Ngày truyền:</span>
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {formatDisplayDate(cycle?.date)}
              </strong>
            </div>
            {cycle?.protocolUsed && (
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                <span>Phác đồ:</span>
                <span className="text-teal-800 dark:text-teal-300 font-semibold bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800/60">
                  {cycle.protocolUsed}
                </span>
              </div>
            )}
            {cycle?.drugNames && (
              <div className="flex justify-between items-start text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-[#3c4043]">
                <span className="shrink-0">Thuốc:</span>
                <span className="text-right text-slate-800 dark:text-slate-200 font-medium truncate max-w-[240px]">
                  {cycle.drugNames}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-[#3c4043] flex items-center justify-end gap-2.5 bg-slate-50 dark:bg-[#252526] shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#475569] bg-white dark:bg-[#2d2d2d] text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-100 dark:hover:bg-[#383838] transition text-xs shadow-sm disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-2 transition shadow-sm disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Đang xóa...
              </>
            ) : (
              <>
                <i className="fa-solid fa-trash"></i> Xóa chu kỳ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteCycleConfirmModal;
