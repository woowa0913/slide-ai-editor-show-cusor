
import React from 'react';
import { Slide } from '../types';

interface SlideThumbnailProps {
  slide: Slide;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onSelect: (e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
}

export const SlideThumbnail: React.FC<SlideThumbnailProps> = ({ 
  slide, 
  index, 
  isActive, 
  isSelected,
  onClick, 
  onSelect,
  onDelete 
}) => {
  return (
    <div 
      className={`group relative flex flex-col gap-2 p-2 rounded-lg cursor-pointer transition-all border-2 
        ${isActive ? 'border-brand-500 bg-brand-500/10' : 'border-transparent hover:bg-gray-800'}
        ${isSelected && !isActive ? 'bg-brand-900/10 border-brand-800/50' : ''}`}
      onClick={onClick}
    >
      <div className="relative aspect-video w-full bg-gray-900 rounded overflow-hidden shadow-sm">
        <img src={slide.imageUrl} alt={`Slide ${index}`} className="w-full h-full object-cover" />
        
        {/* Selection Checkbox Overlay */}
        <div 
          onClick={onSelect}
          className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center z-20
            ${isSelected ? 'bg-brand-500 border-brand-500' : 'bg-black/40 border-white/60 hover:border-white'}`}
        >
          {isSelected && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 rounded">
          {index + 1}
        </div>
        
        {slide.audioData && (
          <div className="absolute bottom-1 right-1 bg-brand-600 text-white p-0.5 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
              <path d="M5.5 9.643a.75.75 0 00-1.06 1.06h.006v.005a6.002 6.002 0 0010.553 0V9.75a.75.75 0 00-1.06-1.06a4.5 4.5 0 01-8.44 1.053z" />
            </svg>
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-400 truncate px-1">
        {slide.script ? slide.script.substring(0, 30) + '...' : <span className="italic opacity-50">No script</span>}
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(slide.id); }}
        className="absolute top-[-8px] left-[-8px] bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-30"
        title="Delete Slide"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
};
