"use client";

import { useEffect, useRef, useState } from "react";
import { sendToGoogleSheet } from "@/lib/googleSheet";

export interface Note {
  id: string;
  text: string;
  category: string;
  color: "yellow" | "pink" | "green" | "blue";
  angle: number;
  date: string; // "YYYY. MM. DD. (요일) HH:mm"
  completed?: boolean;
  order?: number;
}

const STORAGE_KEY = "little-sticky-board-v2";
const THEME_KEY = "post-it-theme-v1";
const COLORS: Note["color"][] = ["yellow", "pink", "green", "blue"];
const CATEGORIES = ["할 일", "아이디어", "기타"];

const COLOR_MAP: Record<Note["color"], number> = {
  yellow: 1,
  pink: 2,
  green: 3,
  blue: 4,
};

function formatCurrentDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[now.getDay()];
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} (${weekday}) ${hours}:${minutes}`;
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<string>("전체");
  const [inputText, setInputText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("할 일");
  const [freshId, setFreshId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 다크 모드
  const [isDark, setIsDark] = useState<boolean>(false);

  // 편집 모달 상태
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("할 일");

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dragRef = useRef<{
    id: string;
    el: HTMLElement;
    ghost: HTMLElement;
    dx: number;
    dy: number;
    x: number;
    y: number;
    target: string | null;
    pointer: number;
    raf?: number;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // 테마 초기화
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "dark") {
        setIsDark(true);
        document.documentElement.classList.add("dark");
      } else {
        setIsDark(false);
        document.documentElement.classList.remove("dark");
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem(THEME_KEY, "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem(THEME_KEY, "light");
    }
  };

  // 메모 불러오기
  useEffect(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("little-sticky-board-v1");
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          const validated: Note[] = parsed
            .filter(
              (n) =>
                n &&
                typeof n.id === "string" &&
                typeof n.text === "string" &&
                (CATEGORIES.includes(n.category) || n.category === "전체") &&
                COLORS.includes(n.color)
            )
            .map((n, idx) => ({
              ...n,
              completed: Boolean(n.completed),
              order: n.order || idx + 1,
              date: n.date || formatCurrentDateTime(),
              angle: Math.max(-2, Math.min(2, Number(n.angle) || 0)),
            }));
          setNotes(validated);
        }
      }
    } catch {
      showToast("저장된 메모를 불러오지 못했습니다.");
    }
  }, []);

  const saveNotes = (updated: Note[]) => {
    setNotes(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      showToast("자동 저장에 실패했습니다.");
    }
  };

  // 1. 메모 추가
  const handleAddNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();

    // 내용을 작성하다가 중단하면 저장하지 않음
    if (!text) {
      textareaRef.current?.focus();
      showToast("메모 내용을 입력해주세요.");
      return;
    }

    const datetime = formatCurrentDateTime();
    const newId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const colorNum = COLOR_MAP[color];

    const newNote: Note = {
      id: newId,
      text,
      category: selectedCategory,
      color,
      angle: Number((Math.random() * 3 - 1.5).toFixed(2)),
      date: datetime,
      completed: false,
      order: 1,
    };

    const nextNotes = [newNote, ...notes.map((n, idx) => ({ ...n, order: idx + 2 }))];

    if (filter !== "전체" && filter !== selectedCategory) {
      setFilter("전체");
    }

    saveNotes(nextNotes);
    setInputText("");
    setFreshId(newId);
    showToast("새 메모가 보드에 붙었어요.");
    setTimeout(() => setFreshId(null), 500);
    textareaRef.current?.focus();

    // 구글 시트에 새 행 추가 (A~G열)
    sendToGoogleSheet({
      action: "save",
      datetime,
      category: selectedCategory,
      content: text,
      color: colorNum,
      state: "진행중",
      completed: false,
      order: 1,
    });
  };

  // 2. 완료 체크 토글
  const handleToggleComplete = (id: string) => {
    const targetNote = notes.find((n) => n.id === id);
    if (!targetNote) return;

    const nextCompleted = !targetNote.completed;
    const nextNotes = notes.map((n) =>
      n.id === id ? { ...n, completed: nextCompleted } : n
    );
    saveNotes(nextNotes);
    showToast(nextCompleted ? "메모를 완료 표시했습니다." : "완료 표시를 취소했습니다.");

    // 구글 시트 상태 업데이트 (A~G열)
    sendToGoogleSheet({
      action: "save",
      datetime: targetNote.date,
      category: targetNote.category,
      content: targetNote.text,
      color: COLOR_MAP[targetNote.color],
      state: nextCompleted ? "완료" : "진행중",
      completed: nextCompleted,
      order: targetNote.order || 1,
    });
  };

  // 3. 메모 삭제 (구글시트에서도 해당 내용 삭제)
  const handleDelete = (id: string) => {
    if (!window.confirm("이 메모를 삭제할까요? (구글 시트에서도 삭제됩니다)")) return;
    const targetNote = notes.find((n) => n.id === id);
    const nextNotes = notes.filter((n) => n.id !== id);
    saveNotes(nextNotes);
    showToast("메모를 삭제했습니다.");

    if (targetNote) {
      sendToGoogleSheet({
        action: "delete",
        content: targetNote.text,
        datetime: targetNote.date,
      });
    }
  };

  // 4. 편집 모달 열기 및 저장
  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setEditText(note.text);
    setEditCategory(note.category);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    const text = editText.trim();

    if (!text) {
      alert("내용을 입력해주세요.");
      return;
    }

    const prevContent = editingNote.text;
    const nextNotes = notes.map((n) =>
      n.id === editingNote.id
        ? {
            ...n,
            text,
            category: editCategory,
          }
        : n
    );
    saveNotes(nextNotes);
    setEditingNote(null);
    showToast("메모를 수정했습니다.");

    // 구글 시트에 업데이트
    sendToGoogleSheet({
      action: "save",
      prevContent,
      datetime: editingNote.date,
      category: editCategory,
      content: text,
      color: COLOR_MAP[editingNote.color],
      state: editingNote.completed ? "완료" : "진행중",
      completed: Boolean(editingNote.completed),
      order: editingNote.order || 1,
    });
  };

  // 5. 메모 순서 변경 (reorder)
  const reorder = (fromId: string, toId: string) => {
    const a = notes.findIndex((n) => n.id === fromId);
    const b = notes.findIndex((n) => n.id === toId);
    if (a < 0 || b < 0 || a === b) return;
    const nextNotes = [...notes];
    const [item] = nextNotes.splice(a, 1);
    nextNotes.splice(b, 0, item);

    const reorderedNotes = nextNotes.map((n, idx) => ({
      ...n,
      order: idx + 1,
    }));

    saveNotes(reorderedNotes);
    showToast("메모 순서를 변경했습니다.");

    // 구글 시트 order(G열) 일괄 업데이트
    sendToGoogleSheet({
      action: "reorder",
      orders: reorderedNotes.map((n) => ({
        id: n.id,
        content: n.text,
        order: n.order!,
      })),
    });
  };

  const visibleNotes = notes.filter(
    (n) => filter === "전체" || n.category === filter
  );

  // 드래그 앤 드롭
  const startDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    id: string,
    el: HTMLElement
  ) => {
    if (e.button !== 0 || dragRef.current) return;
    e.preventDefault();

    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.remove("fresh");
    ghost.classList.add("ghost");
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "1000";
    ghost.style.opacity = "0.9";
    ghost.style.transform = "rotate(4deg)";
    ghost.style.boxShadow = "0 18px 35px rgba(0,0,0,0.25)";
    ghost.style.maxHeight = "320px";
    ghost.style.overflow = "hidden";
    ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.setAttribute("aria-hidden", "true");
    document.body.appendChild(ghost);

    setDraggedId(id);

    dragRef.current = {
      id,
      el,
      ghost,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
      target: null,
      pointer: e.pointerId,
    };

    e.currentTarget.setPointerCapture(e.pointerId);

    const scrollStep = () => {
      if (!dragRef.current) return;
      const y = dragRef.current.y;
      const h = window.innerHeight;
      const d = y < 75 ? -10 : y > h - 75 ? 10 : 0;
      if (d) {
        window.scrollBy(0, d);
        updateTarget();
      }
      dragRef.current.raf = requestAnimationFrame(scrollStep);
    };

    dragRef.current.raf = requestAnimationFrame(scrollStep);
  };

  const updateTarget = () => {
    if (!dragRef.current) return;
    const hit = document
      .elementFromPoint(dragRef.current.x, dragRef.current.y)
      ?.closest(".note:not(.ghost)") as HTMLElement | null;
    const hitId = hit?.dataset.id;
    const target = hitId && hitId !== dragRef.current.id ? hitId : null;
    dragRef.current.target = target;
    setDropTargetId(target);
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointer !== e.pointerId) return;
      e.preventDefault();
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      dragRef.current.ghost.style.left = `${e.clientX - dragRef.current.dx}px`;
      dragRef.current.ghost.style.top = `${e.clientY - dragRef.current.dy}px`;
      updateTarget();
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointer !== e.pointerId) return;
      const d = dragRef.current;
      if (d.raf) cancelAnimationFrame(d.raf);
      d.ghost.remove();
      setDraggedId(null);
      setDropTargetId(null);
      dragRef.current = null;

      if (e.type !== "pointercancel" && d.target) {
        reorder(d.id, d.target);
      }
    };

    const onBlur = () => {
      if (dragRef.current) {
        onPointerEnd({
          pointerId: dragRef.current.pointer,
          type: "pointercancel",
        } as PointerEvent);
      }
    };

    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", onBlur);
    };
  }, [notes]);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? "bg-[#181a1b] text-[#e8e6e3]" : "bg-[#f7f6f2] text-[#292b27]"} font-sans antialiased`}>
      <style jsx global>{`
        .note-yellow {
          background-color: #f6e794;
          color: #292b27;
        }
        .note-pink {
          background-color: #f3cbd4;
          color: #292b27;
        }
        .note-green {
          background-color: #d5e4ba;
          color: #292b27;
        }
        .note-blue {
          background-color: #c6dfea;
          color: #292b27;
        }
        .fresh {
          animation: stick 0.46s cubic-bezier(0.2, 0.8, 0.3, 1.1);
        }
        @keyframes stick {
          0% {
            opacity: 0;
            transform: translateY(-35px) scale(1.13) rotate(-6deg);
            box-shadow: 0 22px 25px rgba(51, 51, 51, 0.15);
          }
          70% {
            opacity: 1;
            transform: translateY(3px) scale(0.98) rotate(var(--angle));
          }
          100% {
            transform: rotate(var(--angle));
          }
        }
        .note-corner::after {
          content: "";
          position: absolute;
          right: 0;
          bottom: 0;
          width: 21px;
          height: 21px;
          background: rgba(255, 255, 255, 0.28);
          border-radius: 15px 0 15px 0;
          pointer-events: none;
        }
      `}</style>

      {/* Header */}
      <header className={`max-w-[1200px] mx-auto px-7 py-6 flex items-center justify-between border-b ${isDark ? "border-[#2f3336]" : "border-[#deded5]"}`}>
        <div className="font-extrabold tracking-[-1px] text-2xl flex items-center">
          <span className="inline-block bg-[#f7dc70] text-[#292b27] px-2.5 py-1 mr-2.5 -rotate-6 rounded-[3px] text-lg leading-none shadow-sm">
            ▧
          </span>
          Post-it Todo List
        </div>

        {/* 테마 토글 버튼 */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "라이트 모드로 변경" : "다크 모드로 변경"}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
            isDark
              ? "bg-[#25282a] border-[#3b4045] text-amber-300 hover:bg-[#31363a]"
              : "bg-white border-[#d9dcd2] text-[#414536] hover:bg-[#f0eee6] shadow-sm"
          }`}
        >
          {isDark ? (
            <>
              <span className="text-base leading-none">☀</span> 라이트 모드
            </>
          ) : (
            <>
              <span className="text-base leading-none">☾</span> 다크 모드
            </>
          )}
        </button>
      </header>

      {/* Composer */}
      <form
        onSubmit={handleAddNote}
        className={`max-w-[650px] mx-5 sm:mx-auto mt-9 mb-12 p-5 border rounded-2xl shadow-[0_10px_28px_rgba(0,0,0,0.06)] transition-colors ${
          isDark
            ? "bg-[#222528] border-[#343a40] shadow-black/20"
            : "bg-white border-[#deded5]"
        }`}
      >
        <textarea
          ref={textareaRef}
          id="memo"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              handleAddNote();
            }
          }}
          placeholder="지금 떠오른 생각을 적어보세요… (Ctrl + Enter로 등록)"
          maxLength={1000}
          required
          rows={3}
          className={`w-full resize-y min-h-[100px] max-h-[300px] border-0 bg-transparent py-2.5 leading-[1.7] focus:outline-none placeholder-[#8e9287] ${
            isDark ? "text-[#f0eee9]" : "text-[#292b27]"
          }`}
        />
        <div
          className={`flex flex-wrap items-center gap-2.5 border-t pt-3.5 ${
            isDark ? "border-[#31363a]" : "border-[#eeeee7]"
          }`}
        >
          <label htmlFor="category" className="sr-only">
            범주
          </label>
          <select
            id="category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`border rounded-lg py-2 px-3 text-sm focus-visible:outline-[#51755b] cursor-pointer ${
              isDark
                ? "bg-[#2d3135] border-[#3f454a] text-[#f0eee9]"
                : "bg-white border-[#d9dcd2] text-[#35392f]"
            }`}
          >
            <option value="할 일">할 일</option>
            <option value="아이디어">아이디어</option>
            <option value="기타">기타</option>
          </select>

          <span className={`text-xs ml-auto ${isDark ? "text-[#8d939b]" : "text-[#696d63]"}`}>
            {inputText.length} / 1,000
          </span>

          <button
            type="submit"
            className="bg-[#303d30] hover:bg-[#435743] dark:bg-[#3d523d] dark:hover:bg-[#4c674c] text-white border-0 rounded-lg py-2.5 px-4 font-semibold text-sm transition-colors cursor-pointer"
          >
            ＋ 메모 붙이기
          </button>
        </div>
      </form>

      {/* Main Board */}
      <main className="max-w-[1200px] mx-auto px-5 sm:px-7 pb-16">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? "text-[#9da4ad]" : "text-[#686e61]"}`}>
              {visibleNotes.length}개 / 총 {notes.length}개
            </span>
          </div>

          <label className={`text-xs flex items-center gap-2 ${isDark ? "text-[#a2a9b3]" : "text-[#5d6558]"}`}>
            <span className="hidden sm:inline">카테고리</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="카테고리별 필터"
              className={`border rounded-lg py-1.5 px-3 text-xs focus-visible:outline-[#51755b] cursor-pointer ${
                isDark
                  ? "bg-[#2d3135] border-[#3f454a] text-[#f0eee9]"
                  : "bg-white border-[#d9dcd2] text-[#35392f]"
              }`}
            >
              <option value="전체">전체</option>
              <option value="할 일">할 일</option>
              <option value="아이디어">아이디어</option>
              <option value="기타">기타</option>
            </select>
          </label>
        </div>

        {/* Notes Grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 items-start"
          aria-label="메모 목록"
        >
          {visibleNotes.length === 0 ? (
            <div
              className={`col-span-full text-center py-16 px-5 border border-dashed rounded-xl ${
                isDark
                  ? "border-[#3e444a] text-[#868d96] bg-[#222528]/50"
                  : "border-[#c9cebf] text-[#68705f] bg-white/50"
              }`}
            >
              {notes.length
                ? "이 카테고리에는 아직 메모가 없어요."
                : "보드가 비어 있어요. 첫 번째 메모를 붙여보세요!"}
            </div>
          ) : (
            visibleNotes.map((note, index) => {
              const colorClass = `note-${note.color}`;
              const isFresh = freshId === note.id;
              const isDragging = draggedId === note.id;
              const isDropTarget = dropTargetId === note.id;

              return (
                <article
                  key={note.id}
                  data-id={note.id}
                  style={
                    {
                      "--angle": `${note.angle}deg`,
                      transform: `rotate(${note.angle}deg)`,
                    } as React.CSSProperties
                  }
                  className={`note ${colorClass} note-corner relative min-h-[250px] p-[20px_20px_16px] rounded-[2px_2px_19px_2px] shadow-[1px_7px_12px_rgba(0,0,0,0.1)] transition-all break-words ${
                    isFresh ? "fresh" : ""
                  } ${isDragging ? "opacity-30" : ""} ${
                    isDropTarget
                      ? "outline outline-3 outline-dashed outline-[#52674a] outline-offset-[6px]"
                      : ""
                  }`}
                >
                  {/* 상단 태그 및 조작 버튼 (완료 체크, 순서, 드래그, 편집, 삭제) */}
                  <div className="flex items-center gap-1.5 mb-3.5">
                    {/* 완료 체크 버튼 (F열 state: 완료/진행중) */}
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(note.id)}
                      title={note.completed ? "완료됨 (클릭하여 취소)" : "완료 체크하기"}
                      className={`flex items-center justify-center w-5 h-5 rounded-full border text-xs font-bold transition-all cursor-pointer ${
                        note.completed
                          ? "bg-[#303d30] border-[#303d30] text-white"
                          : "border-black/30 hover:border-black/60 bg-white/40 text-transparent"
                      }`}
                    >
                      ✓
                    </button>

                    <span className="text-[11px] font-bold border border-black/15 rounded-full px-2 py-0.5 bg-white/35 text-[#292b27]">
                      {note.category}
                    </span>

                    {/* 순서(order) 표시 */}
                    <span className="text-[10px] font-semibold text-black/45 bg-black/5 px-1.5 py-0.5 rounded" title={`메모 순서: ${note.order || index + 1}번째`}>
                      #{note.order || index + 1}
                    </span>

                    {/* 드래그 핸들 */}
                    <button
                      type="button"
                      aria-label="드래그하여 메모 이동"
                      title="드래그하여 순서 이동"
                      onPointerDown={(e) =>
                        startDrag(
                          e,
                          note.id,
                          e.currentTarget.closest("article")!
                        )
                      }
                      className="ml-auto border-0 bg-transparent text-[#414536] p-1 text-lg cursor-grab active:cursor-grabbing touch-none leading-none select-none hover:bg-black/10 rounded"
                    >
                      ⠿
                    </button>

                    {/* 편집 버튼 */}
                    <button
                      type="button"
                      aria-label="메모 편집"
                      title="메모 편집"
                      onClick={() => openEditModal(note)}
                      className="bg-transparent border-0 text-[13px] font-semibold text-[#3b4034] hover:text-[#111] hover:bg-black/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    >
                      ✎
                    </button>

                    {/* 삭제 버튼 */}
                    <button
                      type="button"
                      aria-label="메모 삭제"
                      title="메모 삭제 (구글시트에서도 삭제됨)"
                      onClick={() => handleDelete(note.id)}
                      className="bg-transparent border-0 text-lg leading-none text-[#454b3d] hover:text-red-700 hover:bg-black/10 p-1 rounded transition-colors cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  {/* 본문 내용 (완료 시 취소선 표시) */}
                  <div
                    className={`whitespace-pre-wrap text-[15px] leading-[1.75] min-h-[110px] transition-opacity ${
                      note.completed ? "line-through text-black/40" : "text-[#292b27]"
                    }`}
                  >
                    {note.text}
                  </div>

                  {/* 하단: 왼쪽(작성 날짜시간), 오른쪽(완료 뱃지 & 순서 변경 버튼) */}
                  <div className="flex justify-between items-end mt-4 pt-2 border-t border-black/10">
                    <span className="text-[11px] text-[#555a4e]/75 font-medium tracking-tight">
                      {note.date}
                    </span>
                    <div className="flex items-center gap-1">
                      {note.completed && (
                        <span className="text-[10px] font-bold text-[#303d30] bg-[#303d30]/10 px-1.5 py-0.5 rounded mr-1">
                          완료
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="메모를 앞으로 이동"
                        title="앞으로 이동"
                        disabled={index === 0}
                        onClick={() =>
                          reorder(note.id, visibleNotes[index - 1].id)
                        }
                        className="bg-white/40 hover:bg-white/70 disabled:opacity-30 disabled:cursor-default border-0 rounded px-1.5 py-0.5 text-[#3e4435] text-xs font-bold cursor-pointer"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="메모를 뒤로 이동"
                        title="뒤로 이동"
                        disabled={index === visibleNotes.length - 1}
                        onClick={() =>
                          reorder(note.id, visibleNotes[index + 1].id)
                        }
                        className="bg-white/40 hover:bg-white/70 disabled:opacity-30 disabled:cursor-default border-0 rounded px-1.5 py-0.5 text-[#3e4435] text-xs font-bold cursor-pointer"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* 저작권 표시 푸터 */}
        <footer className={`text-center text-xs mt-16 tracking-wide ${isDark ? "text-[#7c838c]" : "text-[#6b7165]"}`}>
          Copyright INU Post-it Todo List by 최민서
        </footer>
      </main>

      {/* 메모 편집 모달 */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[3000]">
          <div
            className={`w-full max-w-lg p-6 rounded-2xl shadow-2xl border transition-colors ${
              isDark ? "bg-[#222528] border-[#383f46] text-[#f0eee9]" : "bg-white border-[#deded5] text-[#292b27]"
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">메모 편집</h3>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="text-xl text-[#7a8075] hover:text-[#111] dark:hover:text-white"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                maxLength={1000}
                required
                rows={5}
                className={`w-full p-3 rounded-lg border text-sm leading-relaxed mb-4 focus:outline-none focus:ring-2 focus:ring-[#51755b] ${
                  isDark
                    ? "bg-[#2a2e33] border-[#3f464e] text-white"
                    : "bg-[#faf9f5] border-[#dcded6] text-[#292b27]"
                }`}
              />
              <div className="flex items-center gap-3 justify-between">
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={`border rounded-lg py-2 px-3 text-xs cursor-pointer ${
                    isDark
                      ? "bg-[#2d3135] border-[#3f454a] text-[#f0eee9]"
                      : "bg-white border-[#d9dcd2] text-[#35392f]"
                  }`}
                >
                  <option value="할 일">할 일</option>
                  <option value="아이디어">아이디어</option>
                  <option value="기타">기타</option>
                </select>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNote(null)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                      isDark ? "border-[#434b54] text-[#cfd4db] hover:bg-[#2c3137]" : "border-[#d0d3c9] text-[#555a4e] hover:bg-[#f3f2ec]"
                    }`}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#303d30] hover:bg-[#435743] text-white cursor-pointer"
                  >
                    저장하기
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 토스트 알림 */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#303d30] text-white px-5 py-2.5 rounded-xl text-[13px] z-[4000] shadow-lg max-w-[90vw]"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
