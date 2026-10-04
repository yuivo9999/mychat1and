import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Save, 
  Download, 
  Table, 
  Plus, 
  Trash2, 
  Search, 
  ArrowUpDown, 
  Check, 
  Copy, 
  FileSpreadsheet,
  Layers,
  ChevronRight,
  Filter,
  RefreshCw,
  PlusSquare,
  MinusSquare,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WorkspaceFile } from '../types/workspace';
import { downloadWorkspaceFile, formatFileSize, convertUtf16ToUtf8 } from '../services/fileParser';

interface ExcelEditorModalProps {
  isOpen: boolean;
  file: WorkspaceFile | null;
  onClose: () => void;
  onSave: (filePath: string, newContent: string) => void;
}

// Convert 0-indexed column index to Excel column letter (0 -> A, 1 -> B, 25 -> Z, 26 -> AA)
function indexToColLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// RFC 4180 compliant CSV / TSV text parser
export function parseCsvToGrid(csvText: string): (string | number | boolean)[][] {
  if (!csvText || !csvText.trim()) return [['']];
  
  // Clean UTF-16LE / UTF-16 BOMs and null-bytes if present
  let { text: cleanText } = convertUtf16ToUtf8(csvText);
  
  // Auto-detect delimiter: comma (,), semicolon (;), tab (\t), pipe (|)
  const firstLine = cleanText.split(/\r?\n/)[0] || '';
  let delimiter = ',';
  if (!firstLine.includes(',') && firstLine.includes(';')) {
    delimiter = ';';
  } else if (!firstLine.includes(',') && firstLine.includes('\t')) {
    delimiter = '\t';
  }

  const rows: (string | number | boolean)[][] = [];
  let currentRow: (string | number | boolean)[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  // Remove trailing blank rows
  while (rows.length > 1 && rows[rows.length - 1].every(cell => String(cell).trim() === '')) {
    rows.pop();
  }

  return rows.length > 0 ? rows : [['']];
}

// Convert 2D array grid back to standard CSV string
export function gridToCsv(grid: (string | number | boolean)[][]): string {
  return grid
    .map(row => 
      row.map(cell => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    )
    .join('\n');
}

export const ExcelEditorModal: React.FC<ExcelEditorModalProps> = ({
  isOpen,
  file,
  onClose,
  onSave,
}) => {
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [workbookSheets, setWorkbookSheets] = useState<Record<string, (string | number | boolean)[][]>>({});
  
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>({ r: 0, c: 0 });
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ col: number; direction: 'asc' | 'desc' } | null>(null);
  
  const [isSavedToast, setIsSavedToast] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [newSheetName, setNewSheetName] = useState<string>('');
  const [showAddSheetInput, setShowAddSheetInput] = useState<boolean>(false);
  const [encodingConvertedToast, setEncodingConvertedToast] = useState<boolean>(false);

  // Convert raw file content from UTF-16 / UTF-16LE to clean UTF-8
  const handleConvertToUtf8 = () => {
    if (!file) return;
    const { text } = convertUtf16ToUtf8(file.content || '');
    const newGrid = parseCsvToGrid(text);
    setWorkbookSheets(prev => ({
      ...prev,
      [activeSheetName || 'Sheet1']: newGrid,
    }));
    setEncodingConvertedToast(true);
    setTimeout(() => setEncodingConvertedToast(false), 3500);
  };

  const cellInputRef = useRef<HTMLInputElement>(null);

  // Initialize and parse Excel workbook or CSV from WorkspaceFile
  useEffect(() => {
    if (!file || !isOpen) return;

    try {
      const lowerPath = file.path.toLowerCase();
      const isCsvOrTsv = lowerPath.endsWith('.csv') || lowerPath.endsWith('.tsv');

      if (isCsvOrTsv && !file.content.startsWith('data:')) {
        // Direct CSV / TSV Parsing using RFC 4180 parser
        const parsedGrid = parseCsvToGrid(file.content || '');
        const defaultSheet = 'Sheet1';
        setSheetNames([defaultSheet]);
        setActiveSheetName(defaultSheet);
        setWorkbookSheets({ [defaultSheet]: parsedGrid });
        setSelectedCell({ r: 0, c: 0 });
        setEditingCellValue(String(parsedGrid[0]?.[0] ?? ''));
        setSearchQuery('');
        setSortConfig(null);
        return;
      }

      let wb: XLSX.WorkBook;

      if (file.content.startsWith('data:')) {
        // Base64 Data URL
        const base64Part = file.content.split(',')[1] || '';
        wb = XLSX.read(base64Part, { type: 'base64' });
      } else if (file.isBinary) {
        // Binary base64 string
        wb = XLSX.read(file.content, { type: 'base64' });
      } else {
        // Raw text (CSV, TSV, HTML table)
        wb = XLSX.read(file.content, { type: 'string', raw: true });
      }

      const names = wb.SheetNames.length > 0 ? wb.SheetNames : ['Sheet1'];
      const parsedSheets: Record<string, (string | number | boolean)[][]> = {};

      names.forEach((name) => {
        const ws = wb.Sheets[name];
        if (ws) {
          // Convert worksheet to 2D array matrix
          const data = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(ws, { header: 1, defval: '' });
          parsedSheets[name] = data.length > 0 ? data : [['']];
        } else {
          parsedSheets[name] = [['']];
        }
      });

      setSheetNames(names);
      setActiveSheetName(names[0]);
      setWorkbookSheets(parsedSheets);
      setSelectedCell({ r: 0, c: 0 });
      setEditingCellValue(String(parsedSheets[names[0]]?.[0]?.[0] ?? ''));
      setSearchQuery('');
      setSortConfig(null);
    } catch (e) {
      console.error('解析 Excel 文件出错:', e);
      // Fallback for raw text parsing or empty table
      const fallbackName = 'Sheet1';
      const parsedGrid = parseCsvToGrid(file.content || '');
      setSheetNames([fallbackName]);
      setActiveSheetName(fallbackName);
      setWorkbookSheets({ [fallbackName]: parsedGrid });
      setSelectedCell({ r: 0, c: 0 });
      setEditingCellValue(String(parsedGrid[0]?.[0] ?? ''));
    }
  }, [file, isOpen]);

  // Current active grid matrix
  const currentGrid = useMemo(() => {
    return workbookSheets[activeSheetName] || [['']];
  }, [workbookSheets, activeSheetName]);

  // Max columns count in current grid
  const maxCols = useMemo(() => {
    let max = 1;
    currentGrid.forEach(row => {
      if (Array.isArray(row) && row.length > max) {
        max = row.length;
      }
    });
    return Math.max(max, 6); // Ensure at least 6 columns
  }, [currentGrid]);

  // Keep cell input value in sync when selection changes
  useEffect(() => {
    if (selectedCell) {
      const val = currentGrid[selectedCell.r]?.[selectedCell.c] ?? '';
      setEditingCellValue(String(val));
    }
  }, [selectedCell, currentGrid]);

  if (!isOpen || !file) return null;

  // Handle cell value change
  const updateCellValue = (rowIdx: number, colIdx: number, val: string) => {
    setWorkbookSheets(prev => {
      const activeData = prev[activeSheetName] ? [...prev[activeSheetName]] : [['']];
      // Ensure row exists
      while (activeData.length <= rowIdx) {
        activeData.push([]);
      }
      const newRow = [...(activeData[rowIdx] || [])];
      // Ensure col exists
      while (newRow.length <= colIdx) {
        newRow.push('');
      }
      newRow[colIdx] = val;
      activeData[rowIdx] = newRow;

      return {
        ...prev,
        [activeSheetName]: activeData,
      };
    });
  };

  // Cell click handler
  const handleSelectCell = (r: number, c: number) => {
    setSelectedCell({ r, c });
  };

  // Add new row at bottom
  const handleAddRow = () => {
    setWorkbookSheets(prev => {
      const activeData = prev[activeSheetName] ? [...prev[activeSheetName]] : [];
      const newRow = new Array(maxCols).fill('');
      return {
        ...prev,
        [activeSheetName]: [...activeData, newRow],
      };
    });
  };

  // Delete selected row
  const handleDeleteSelectedRow = () => {
    if (!selectedCell) return;
    setWorkbookSheets(prev => {
      const activeData = prev[activeSheetName] ? [...prev[activeSheetName]] : [];
      if (activeData.length <= 1) return prev;
      const filtered = activeData.filter((_, idx) => idx !== selectedCell.r);
      return {
        ...prev,
        [activeSheetName]: filtered,
      };
    });
    setSelectedCell(prev => prev ? { r: Math.max(0, prev.r - 1), c: prev.c } : { r: 0, c: 0 });
  };

  // Add new column
  const handleAddColumn = () => {
    setWorkbookSheets(prev => {
      const activeData = prev[activeSheetName] ? [...prev[activeSheetName]] : [];
      const updated = activeData.map(row => [...row, '']);
      return {
        ...prev,
        [activeSheetName]: updated.length > 0 ? updated : [['']],
      };
    });
  };

  // Delete selected column
  const handleDeleteSelectedColumn = () => {
    if (!selectedCell) return;
    setWorkbookSheets(prev => {
      const activeData = prev[activeSheetName] ? [...prev[activeSheetName]] : [];
      if (maxCols <= 1) return prev;
      const updated = activeData.map(row => row.filter((_, idx) => idx !== selectedCell.c));
      return {
        ...prev,
        [activeSheetName]: updated,
      };
    });
    setSelectedCell(prev => prev ? { r: prev.r, c: Math.max(0, prev.c - 1) } : { r: 0, c: 0 });
  };

  // Add new sheet
  const handleCreateSheet = () => {
    const name = newSheetName.trim() || `Sheet${sheetNames.length + 1}`;
    if (sheetNames.includes(name)) {
      alert(`工作表名称「${name}」已存在`);
      return;
    }
    setSheetNames(prev => [...prev, name]);
    setWorkbookSheets(prev => ({ ...prev, [name]: [['', '', ''], ['', '', '']] }));
    setActiveSheetName(name);
    setNewSheetName('');
    setShowAddSheetInput(false);
  };

  // Delete current sheet
  const handleDeleteCurrentSheet = () => {
    if (sheetNames.length <= 1) {
      alert('至少需要保留一个工作表');
      return;
    }
    if (!confirm(`确定要删除工作表「${activeSheetName}」吗？`)) return;

    const remaining = sheetNames.filter(n => n !== activeSheetName);
    setSheetNames(remaining);
    setWorkbookSheets(prev => {
      const copy = { ...prev };
      delete copy[activeSheetName];
      return copy;
    });
    setActiveSheetName(remaining[0]);
  };

  // Filtered rows for search query
  const displayedGrid = useMemo(() => {
    let rows = currentGrid.map((row, idx) => ({ row, originalIndex: idx }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(({ row }) => 
        row.some(cell => String(cell ?? '').toLowerCase().includes(q))
      );
    }

    if (sortConfig) {
      const { col, direction } = sortConfig;
      rows.sort((a, b) => {
        const valA = String(a.row[col] ?? '');
        const valB = String(b.row[col] ?? '');
        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return direction === 'asc' ? numA - numB : numB - numA;
        }
        return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return rows;
  }, [currentGrid, searchQuery, sortConfig]);

  // Sort toggle for a column
  const handleToggleSort = (colIdx: number) => {
    setSortConfig(prev => {
      if (prev?.col === colIdx) {
        return prev.direction === 'asc' ? { col: colIdx, direction: 'desc' } : null;
      }
      return { col: colIdx, direction: 'asc' };
    });
  };

  // Save changes back to Workspace
  const handleSaveToWorkspace = () => {
    try {
      const wb = XLSX.utils.book_new();
      sheetNames.forEach(name => {
        const gridData = workbookSheets[name] || [['']];
        const ws = XLSX.utils.aoa_to_sheet(gridData);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });

      let updatedContent = '';
      const lowerPath = file.path.toLowerCase();

      if (lowerPath.endsWith('.csv') || lowerPath.endsWith('.tsv')) {
        // Export to pure standard CSV string
        const activeGrid = workbookSheets[activeSheetName] || [['']];
        updatedContent = gridToCsv(activeGrid);
      } else {
        // Export to XLSX Base64 Data URL
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        updatedContent = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      }

      onSave(file.path, updatedContent);
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 2200);
    } catch (e: any) {
      alert(`保存失败: ${e.message || '格式转换异常'}`);
    }
  };

  // Download updated file directly
  const handleDownloadFile = () => {
    try {
      const wb = XLSX.utils.book_new();
      sheetNames.forEach(name => {
        const gridData = workbookSheets[name] || [['']];
        const ws = XLSX.utils.aoa_to_sheet(gridData);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });

      const lowerPath = file.path.toLowerCase();
      if (lowerPath.endsWith('.csv') || lowerPath.endsWith('.tsv')) {
        const activeGrid = workbookSheets[activeSheetName] || [['']];
        const csvStr = gridToCsv(activeGrid);
        downloadWorkspaceFile(file.path, csvStr);
      } else {
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
        downloadWorkspaceFile(file.path, dataUrl);
      }
    } catch (e: any) {
      alert(`导出下载失败: ${e.message || '未知错误'}`);
    }
  };

  const selectedColLetter = selectedCell ? indexToColLetter(selectedCell.c) : 'A';
  const selectedCellAddress = selectedCell ? `${selectedColLetter}${selectedCell.r + 1}` : 'A1';

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[880px] max-h-[95vh] bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-800 flex flex-col overflow-hidden animate-in zoom-in-95"
      >
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-neutral-100 truncate max-w-[280px] sm:max-w-[420px]">
                  {file.path.split('/').pop()}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shrink-0">
                  EXCEL 表格编辑器
                </span>
                {isSavedToast && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500 text-black animate-in fade-in">
                    ✓ 保存成功
                  </span>
                )}
                {encodingConvertedToast && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-400 text-black animate-in fade-in">
                    ✓ 已转为 UTF-8 编码，请点击“保存表格”
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                {file.path} ({formatFileSize(file.size || file.content.length)})
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConvertToUtf8}
              className="px-3 py-1.5 rounded-xl border border-amber-500/40 hover:border-amber-500 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0"
              title="将 UTF-16 / UTF-16LE / 空字节 BOM 标记转为标准 UTF-8 编码"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>转 UTF-8</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToWorkspace}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
              title="将修改后的表格保存覆盖到工作区 (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>保存表格</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadFile}
              className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              title="导出下载 Excel 原格式文件"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">导出下载</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-500 transition cursor-pointer shadow-xs active:scale-95 flex items-center justify-center"
              title="关闭表格"
            >
              <X className="w-4.5 h-4.5 text-white" />
            </button>
          </div>
        </div>

        {/* Toolbar & Formula Bar */}
        <div className="px-4 py-2.5 bg-neutral-950/90 border-b border-neutral-800 flex flex-col gap-2 shrink-0">
          {/* Row 1: Formula / Cell Edit Bar */}
          <div className="flex items-center gap-2">
            <div className="w-16 h-8 rounded-lg bg-neutral-850 border border-neutral-750 flex items-center justify-center font-mono text-xs font-bold text-emerald-400 shrink-0 shadow-inner">
              {selectedCellAddress}
            </div>

            <span className="text-neutral-500 font-mono text-xs">ƒx</span>

            <input
              ref={cellInputRef}
              type="text"
              value={editingCellValue}
              onChange={(e) => {
                setEditingCellValue(e.target.value);
                if (selectedCell) {
                  updateCellValue(selectedCell.r, selectedCell.c, e.target.value);
                }
              }}
              placeholder="在此处编辑选中单元格内容..."
              className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-750 rounded-lg text-neutral-100 placeholder-neutral-500 outline-hidden font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
            />
          </div>

          {/* Row 2: Search & Grid Operations */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Left: Row/Col Insertion & Deletion */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddRow}
                className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 font-medium flex items-center gap-1 transition cursor-pointer"
                title="在表格底部追加新行"
              >
                <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ 插入行</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteSelectedRow}
                disabled={!selectedCell}
                className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-red-900/50 bg-neutral-850 hover:bg-red-950/30 text-neutral-300 hover:text-red-300 font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title={`删除当前选中的第 ${selectedCell ? selectedCell.r + 1 : 1} 行`}
              >
                <MinusSquare className="w-3.5 h-3.5 text-red-400" />
                <span>删除行</span>
              </button>

              <div className="w-px h-4 bg-neutral-800 mx-0.5" />

              <button
                type="button"
                onClick={handleAddColumn}
                className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 font-medium flex items-center gap-1 transition cursor-pointer"
                title="在表格最右侧追加新列"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ 插入列</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteSelectedColumn}
                disabled={!selectedCell}
                className="px-2.5 py-1 rounded-lg border border-neutral-800 hover:border-red-900/50 bg-neutral-850 hover:bg-red-950/30 text-neutral-300 hover:text-red-300 font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title={`删除当前选中的第 ${selectedColLetter} 列`}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>删除列</span>
              </button>
            </div>

            {/* Right: Search Input */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="筛选查找表格数据..."
                className="w-48 sm:w-60 pl-8 pr-2.5 py-1 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-200 placeholder-neutral-500 outline-hidden focus:border-emerald-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-neutral-500 hover:text-neutral-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Spreadsheet Table Grid Container */}
        <div className="flex-1 min-h-0 overflow-auto bg-neutral-950 relative scrollbar-thin scrollbar-thumb-neutral-800">
          <table className="w-full border-collapse text-xs font-sans table-fixed min-w-[640px]">
            {/* Column Letter Headers */}
            <thead>
              <tr className="bg-neutral-900/90 text-neutral-400 font-mono text-[11px] sticky top-0 z-20 shadow-xs border-b border-neutral-800">
                <th className="w-12 py-2 px-1 text-center bg-neutral-900 border-r border-neutral-800 font-normal shrink-0 sticky left-0 z-30">
                  #
                </th>
                {Array.from({ length: maxCols }).map((_, cIdx) => {
                  const letter = indexToColLetter(cIdx);
                  const isSorted = sortConfig?.col === cIdx;
                  return (
                    <th 
                      key={cIdx} 
                      className="min-w-[120px] py-1.5 px-2 border-r border-neutral-800 font-semibold text-neutral-300 select-none hover:bg-neutral-800/80 transition cursor-pointer"
                      onClick={() => handleToggleSort(cIdx)}
                      title={`按第 ${letter} 列排序 (${isSorted ? (sortConfig?.direction === 'asc' ? '升序中' : '降序中') : '点击排序'})`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>{letter}</span>
                        <ArrowUpDown className={`w-3 h-3 ${isSorted ? 'text-emerald-400' : 'text-neutral-600'}`} />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Table Rows & Cells */}
            <tbody>
              {displayedGrid.length === 0 ? (
                <tr>
                  <td colSpan={maxCols + 1} className="py-12 text-center text-neutral-500 font-mono">
                    未找到符合「{searchQuery}」的数据行
                  </td>
                </tr>
              ) : (
                displayedGrid.map(({ row, originalIndex }) => {
                  return (
                    <tr 
                      key={originalIndex}
                      className="border-b border-neutral-850 hover:bg-neutral-900/60 transition group"
                    >
                      {/* Row Index Header Number (1, 2, 3...) with white color */}
                      <td className="py-1.5 px-1 text-center font-mono text-[10px] text-white bg-neutral-900/90 border-r border-neutral-800 select-none sticky left-0 z-10 group-hover:bg-neutral-850 group-hover:text-white">
                        {originalIndex + 1}
                      </td>

                      {/* Row Cells */}
                      {Array.from({ length: maxCols }).map((_, cIdx) => {
                        const cellVal = row[cIdx] ?? '';
                        const isSelected = selectedCell?.r === originalIndex && selectedCell?.c === cIdx;

                        return (
                          <td
                            key={cIdx}
                            onClick={() => handleSelectCell(originalIndex, cIdx)}
                            className={`py-1.5 px-2.5 border-r border-neutral-800 font-mono text-xs truncate cursor-pointer transition select-text ${
                              isSelected
                                ? 'bg-emerald-100 text-emerald-900 ring-2 ring-emerald-500/80 z-10 font-bold'
                                : 'bg-white text-black hover:bg-neutral-100'
                            }`}
                            title={`单元格 [${indexToColLetter(cIdx)}${originalIndex + 1}]: ${String(cellVal)}`}
                          >
                            {String(cellVal)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Bar: Sheets Tabs & Stats */}
        <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between shrink-0 gap-3 text-xs">
          {/* Left: Worksheets Tabs Bar */}
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>工作表:</span>
            </span>

            {sheetNames.map((name) => {
              const isActive = name === activeSheetName;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setActiveSheetName(name);
                    setSelectedCell({ r: 0, c: 0 });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 border ${
                    isActive
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-2xs'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {name}
                </button>
              );
            })}

            {showAddSheetInput ? (
              <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 shrink-0">
                <input
                  type="text"
                  value={newSheetName}
                  onChange={(e) => setNewSheetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSheet();
                    if (e.key === 'Escape') setShowAddSheetInput(false);
                  }}
                  autoFocus
                  placeholder="新工作表名..."
                  className="w-24 px-2 py-0.5 text-xs bg-transparent outline-hidden text-neutral-100"
                />
                <button
                  type="button"
                  onClick={handleCreateSheet}
                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSheetInput(false)}
                  className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddSheetInput(true)}
                className="p-1 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer shrink-0"
                title="新建工作表"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {sheetNames.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteCurrentSheet}
                className="p-1 rounded-lg border border-neutral-800 hover:border-red-900/50 bg-neutral-900 hover:bg-red-950/40 text-neutral-500 hover:text-red-400 transition cursor-pointer shrink-0 ml-1"
                title={`删除工作表「${activeSheetName}」`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right: Grid Stats (Rows Count, Columns Count, Active Cell) */}
          <div className="flex items-center gap-3 shrink-0 text-neutral-400 font-mono text-[11px]">
            <span>行数: <strong className="text-blue-500 dark:text-blue-400 font-bold">{currentGrid.length}</strong></span>
            <span>列数: <strong className="text-blue-500 dark:text-blue-400 font-bold">{maxCols}</strong></span>
            {selectedCell && (
              <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60 font-bold">
                [{selectedCellAddress}]
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
