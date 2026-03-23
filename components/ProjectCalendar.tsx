import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project } from '../types';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckSquare, Square, Filter, X } from 'lucide-react';

interface ProjectCalendarProps {
    projects: Project[];
    onBack: () => void;
}

// Fixed distinct color palette
const COLOR_PALETTE = [
    { bg: 'bg-blue-500', bgSoft: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-700' },
    { bg: 'bg-green-500', bgSoft: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-700' },
    { bg: 'bg-amber-500', bgSoft: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
    { bg: 'bg-purple-500', bgSoft: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
    { bg: 'bg-rose-500', bgSoft: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-700' },
    { bg: 'bg-cyan-500', bgSoft: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-700' },
    { bg: 'bg-indigo-500', bgSoft: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-700' },
    { bg: 'bg-orange-500', bgSoft: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-700' },
    { bg: 'bg-lime-500', bgSoft: 'bg-lime-100 dark:bg-lime-900/40', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-700' },
    { bg: 'bg-pink-500', bgSoft: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-700' },
];

const ProjectCalendar: React.FC<ProjectCalendarProps> = ({ projects, onBack }) => {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]); // Empty = Show All
    const [activeTooltipDate, setActiveTooltipDate] = useState<string | null>(null);
    
    // Scroll ref
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Reset scroll on filter/year change
    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentYear, selectedProjectIds]);

    // Close tooltip when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setActiveTooltipDate(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    // Assign consistent colors
    const projectColors = useMemo(() => {
        const map: Record<string, typeof COLOR_PALETTE[0]> = {};
        projects.forEach((p, index) => {
            map[p.id] = COLOR_PALETTE[index % COLOR_PALETTE.length];
        });
        return map;
    }, [projects]);

    const toggleProjectSelection = (id: string) => {
        setSelectedProjectIds(prev => 
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedProjectIds.length === projects.length) {
            setSelectedProjectIds([]); // Deselect all (which implies show all in UI logic, but let's be explicit)
        } else {
            setSelectedProjectIds(projects.map(p => p.id));
        }
    };

    const getDaysInMonth = (month: number, year: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getProjectsForDate = (date: Date) => {
        // First filter by availability
        const active = projects.filter(p => {
            const start = new Date(p.startDate);
            start.setHours(0,0,0,0);
            
            let end = p.endDate ? new Date(p.endDate) : new Date(start);
            end.setHours(23,59,59,999);
            
            if (end < start) end = new Date(start);

            return date >= start && date <= end;
        });

        // Then filter by user selection (if any selection is made)
        if (selectedProjectIds.length > 0) {
            return active.filter(p => selectedProjectIds.includes(p.id));
        }
        return active;
    };

    const renderMonth = (monthIndex: number) => {
        const daysInMonth = getDaysInMonth(monthIndex, currentYear);
        const firstDayOfMonth = new Date(currentYear, monthIndex, 1).getDay(); // 0 = Sunday, 1 = Monday, ...
        
        // Adjust for Monday start (Spanish calendar)
        // Standard JS: 0=Sun, 1=Mon, 2=Tue...
        // We want: 0=Mon, 1=Tue... 6=Sun
        const startDayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const emptyDays = Array.from({ length: startDayOffset }, (_, i) => i);

        const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

        return (
            <div key={monthIndex} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col h-full">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 dark:text-white capitalize text-sm">{months[monthIndex]}</h3>
                </div>
                
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                    {weekDays.map(d => (
                        <div key={d} className="text-center py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                            {d}
                        </div>
                    ))}
                </div>

                <div className="p-1 grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-700 flex-1 auto-rows-fr">
                    {/* Empty cells for days before the 1st */}
                    {emptyDays.map(i => (
                        <div key={`empty-${i}`} className="bg-slate-50/50 dark:bg-slate-800/50 min-h-[60px]"></div>
                    ))}

                    {days.map(day => {
                        const date = new Date(currentYear, monthIndex, day);
                        const activeProjects = getProjectsForDate(date);
                        const isSingleProject = activeProjects.length === 1;
                        
                        const today = new Date();
                        const isToday = date.getDate() === today.getDate() && 
                                        date.getMonth() === today.getMonth() && 
                                        date.getFullYear() === today.getFullYear();

                        const dateString = `${currentYear}-${monthIndex}-${day}`;

                        // Style calculation based on occupancy
                        let cellClasses = "bg-white dark:bg-slate-800 relative flex flex-col justify-between p-1 transition-all hover:z-10 cursor-pointer";
                        let dateClasses = "text-[10px] font-medium text-slate-400 dark:text-slate-500 z-10";
                        
                        // If exactly one project, color the WHOLE cell background
                        if (isSingleProject) {
                            const pColor = projectColors[activeProjects[0].id];
                            cellClasses = `${pColor.bgSoft} relative flex flex-col justify-between p-1 border-b border-r border-white/50 dark:border-slate-800/50 hover:brightness-95 transition-all cursor-pointer`;
                            dateClasses = `text-[10px] font-bold ${pColor.text} z-10`;
                        }

                        if (isToday) {
                            cellClasses += " ring-2 ring-indigo-500 z-20 shadow-lg";
                            dateClasses = "text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 z-10 bg-indigo-50 dark:bg-indigo-900/50 px-1.5 rounded-full";
                        }

                        const handleDayClick = (e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (activeProjects.length > 0) {
                                setActiveTooltipDate(activeTooltipDate === dateString ? null : dateString);
                            }
                        };

                        return (
                            <div 
                                key={day} 
                                className={`min-h-[60px] ${cellClasses} group`}
                                onClick={handleDayClick}
                            >
                                <span className={dateClasses}>{day}</span>
                                
                                <div className="flex flex-col gap-1 w-full z-0 mt-1">
                                    {/* If single project, we already colored the background, just maybe show a small line or nothing */}
                                    {isSingleProject && (
                                        <div className="flex-1 flex flex-col justify-end">
                                             <div className={`h-1.5 w-full rounded-full ${projectColors[activeProjects[0].id].bg} opacity-50`}></div>
                                        </div>
                                    )}

                                    {/* If multiple projects, stack bars clearly */}
                                    {!isSingleProject && activeProjects.map(p => (
                                        <div 
                                            key={p.id} 
                                            className={`h-2.5 w-full rounded-md ${projectColors[p.id].bg} shadow-sm`}
                                            title={`${p.name}`}
                                        />
                                    ))}
                                </div>

                                {/* Tooltip on hover or click */}
                                {activeProjects.length > 0 && (
                                    <div className={`absolute left-1/2 bottom-full mb-2 -translate-x-1/2 ${activeTooltipDate === dateString ? 'block' : 'hidden group-hover:block'} w-32 bg-slate-900 text-white text-xs p-2 rounded-lg shadow-xl z-50 pointer-events-none`}>
                                        <div className="font-bold mb-1 border-b border-slate-700 pb-1">{day} {months[monthIndex]}</div>
                                        {activeProjects.map(p => (
                                            <div key={p.id} className="truncate">• {p.name}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 shadow-sm px-4 sm:px-8 py-4 border-b border-slate-100 dark:border-slate-700 transition-colors sticky top-0 z-40">
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    <div className="flex items-center w-full xl:w-auto justify-between xl:justify-start">
                        <div className="flex items-center">
                            <button onClick={onBack} className="mr-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors">
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                    <CalendarIcon className="text-indigo-600 dark:text-indigo-400 w-6 h-6" /> 
                                    <span className="hidden sm:inline">Calendario de Obras</span>
                                    <span className="sm:hidden">Calendario</span>
                                </h1>
                            </div>
                        </div>
                         <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 ml-4">
                            <button onClick={() => setCurrentYear(currentYear - 1)} className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-md transition-colors text-slate-600 dark:text-slate-300">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="font-bold text-sm px-2 text-slate-800 dark:text-white">{currentYear}</span>
                            <button onClick={() => setCurrentYear(currentYear + 1)} className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-md transition-colors text-slate-600 dark:text-slate-300">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
                        <div className="flex items-center gap-2">
                             <div className="flex items-center gap-2 mr-2 text-slate-400 text-xs font-bold uppercase tracking-wide shrink-0">
                                <Filter className="w-4 h-4" />
                                Filtrar:
                             </div>
                             <button 
                                onClick={() => setSelectedProjectIds([])}
                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                    selectedProjectIds.length === 0 
                                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                             >
                                Todos
                             </button>
                             {projects.map(p => {
                                 const isSelected = selectedProjectIds.includes(p.id);
                                 const pColor = projectColors[p.id];
                                 return (
                                    <button
                                        key={p.id}
                                        onClick={() => toggleProjectSelection(p.id)}
                                        className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                            isSelected 
                                            ? `${pColor.bg} text-white ${pColor.border} shadow-sm ring-1 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 ring-${pColor.bg.split('-')[1]}-500` 
                                            : `bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700`
                                        }`}
                                    >
                                        {!isSelected && <div className={`w-2 h-2 rounded-full ${pColor.bg}`}></div>}
                                        {isSelected && <CheckSquare className="w-3 h-3" />}
                                        {p.name.substring(0, 15)}{p.name.length > 15 ? '...' : ''}
                                    </button>
                                 );
                             })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-[1600px] mx-auto w-full" ref={scrollContainerRef}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-fr">
                    {months.map((_, index) => renderMonth(index))}
                </div>
            </div>
        </div>
    );
};

export default ProjectCalendar;