/**
 * ChemotherapyHistoryItem.tsx
 * OncoCare Pro - Minimalist Apple HIG Chemotherapy History Item Component
 * 
 * Replaces box-with-X / legacy glyphs with monoline Apple HIG ChevronDown / ChevronUp
 * icons (strokeWidth={1.5}). Fully preserves state, event handlers, and layout.
 */

import React, { useState } from 'react';

export interface ChemotherapyCycleItem {
  cycleName?: string;
  protocol?: string;
  date?: string;
  doseInput?: string;
  notes?: string;
  [key: string]: any;
}

export interface ChemotherapyHistoryItemProps {
  item: ChemotherapyCycleItem;
}

export const ChemotherapyHistoryItem: React.FC<ChemotherapyHistoryItemProps> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-[#111c24] border border-slate-800 rounded-xl p-4 mb-3 transition-all">
      {/* Phần tiêu đề dòng lịch sử */}
      <div 
        className="flex items-center justify-between cursor-pointer select-none" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="text-white font-medium">Đợt hóa trị: {item.cycleName || 'Chu kỳ'}</div>
        
        {/* Icon mở rộng - thu gọn (Apple HIG Minimalist Outline Style) */}
        <button 
          type="button"
          aria-label={isExpanded ? 'Thu gọn chi tiết' : 'Mở rộng chi tiết'}
          aria-expanded={isExpanded}
          className="p-1.5 text-slate-400 hover:text-white transition-colors flex items-center justify-center rounded-lg hover:bg-slate-800/60"
        >
          {isExpanded ? (
            <svg 
              className="w-5 h-5 shrink-0 transition-transform duration-200" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth={1.5} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              aria-hidden="true"
            >
              <path d="m18 15-6-6-6 6"/>
            </svg>
          ) : (
            <svg 
              className="w-5 h-5 shrink-0 transition-transform duration-200" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth={1.5} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          )}
        </button>
      </div>

      {/* Nội dung chi tiết sẽ ẩn/hiện khi bấm */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-slate-300 text-sm space-y-1">
          {item.protocol && <p><strong className="text-slate-400 font-normal">Phác đồ:</strong> {item.protocol}</p>}
          {item.date && <p><strong className="text-slate-400 font-normal">Ngày thực hiện:</strong> {item.date}</p>}
          {item.doseInput && <p><strong className="text-slate-400 font-normal">Liều lượng:</strong> {item.doseInput}</p>}
          {item.notes && <p><strong className="text-slate-400 font-normal">Ghi chú:</strong> {item.notes}</p>}
        </div>
      )}
    </div>
  );
};

export default ChemotherapyHistoryItem;
