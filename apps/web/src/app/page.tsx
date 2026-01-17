"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Copy, Plus, Filter, Trash2, RotateCcw, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listItems, getCategories, getTools, listSeries, trashItem, restoreItem } from "@/lib/api";
import { fileUrl } from "@/lib/files";
import type { CategoryDTO, ToolDTO, ItemDTO, SeriesDTO } from "@/lib/types";
import { toast } from "sonner";
import { AddItemDialog } from "@/components/AddItemDialog";
import { ItemDetailDialog } from "@/components/ItemDetailDialog";
import { FilterDialog, type FilterState } from "@/components/FilterDialog";
import { ActiveFiltersBar } from "@/components/ActiveFiltersBar";
import { BulkActionBar } from "@/components/BulkActionBar";

function Chip({ active, children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-yellow-400 bg-yellow-200 text-yellow-950" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
    >
      {children}
    </button>
  );
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("已复制提示词");
}

function categoryBadgeClass(name: string) {
  const n = (name || "").toLowerCase();
  if (/(肖像|角色|人物|人像)/.test(n)) return "border-yellow-200 bg-yellow-100 text-yellow-900";
  if (/(风景|自然|室内)/.test(n)) return "border-emerald-200 bg-emerald-100 text-emerald-900";
  if (/(品牌|标志|信息图|数据)/.test(n)) return "border-blue-200 bg-blue-100 text-blue-900";
  if (/(插画|卡通|纸艺|粘土|毛毡|玩具)/.test(n)) return "border-violet-200 bg-violet-100 text-violet-900";
  if (/(美食)/.test(n)) return "border-orange-200 bg-orange-100 text-orange-900";
  return "border-gray-200 bg-gray-100 text-gray-800";
}


function PageContent() {
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<CategoryDTO[]>([]);
  const [tools, setTools] = useState<ToolDTO[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDTO[]>([]);

  const [activeCat, setActiveCat] = useState<string>("全部");
  const [toolId, setToolId] = useState<string>("");

  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ mediaType: "", seriesId: "", tagsText: "" });

  const [items, setItems] = useState<ItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"active" | "trash">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "trash") setView("trash");
    if (v === "active") setView("active");
  }, [searchParams]);

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelected() {
    setSelected(new Set());
  }

  function selectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.add(it.id));
      return next;
    });
  }

  function unselectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.delete(it.id));
      return next;
    });
  }

  // load config
  useEffect(() => {
    (async () => {
      try {
        const [c, t, s] = await Promise.all([getCategories(), getTools(), listSeries()]);
        setCats(c.items);
        setTools(t.items);
        setSeriesList(s);
      } catch (e: any) {
        toast.error(e?.message || String(e));
        setCats([]);
        setTools([]);
        setSeriesList([]);
      }
    })();
  }, []);

  const categoryId = useMemo(() => {
    if (activeCat === "全部") return "";
    const c = cats.find((x) => x.name === activeCat);
    return c?.id || "";
  }, [activeCat, cats]);

  async function refresh(nextPage = 1) {
    setLoading(true);
    setErr(null);
    try {
      const tagsArr = filters.tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const data = await listItems({
        q: q || undefined,
        page: nextPage,
        page_size: pageSize,
        category_id: categoryId || undefined,
        tool_id: toolId || undefined,
        series_id: filters.seriesId || undefined,
        media_type: filters.mediaType || undefined,
        tag: tagsArr.length ? tagsArr : undefined,
        include_deleted: view === "trash" ? 1 : 0,
        only_deleted: view === "trash" ? 1 : 0,
      });
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => refresh(1), 250); // debounce
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, toolId, filters, view]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Top bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full items-center gap-3">
            <div className="relative w-full md:max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索提示词、标签、系列、工具…"
                className="h-11 rounded-full pl-10"
              />
            </div>
            <Button
              variant="secondary"
              className="hidden h-11 rounded-full md:inline-flex"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="mr-2 h-4 w-4" />
              筛选
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-11 rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
              onClick={() => setAddOpen(true)}
              disabled={view === "trash"}
            >
              <Plus className="mr-2 h-4 w-4" /> 添加
            </Button>
          </div>
        </div>

        {/* Category pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip active={activeCat === "全部"} onClick={() => setActiveCat("全部")}>全部</Chip>
          {cats.map((c) => (
            <Chip key={c.id} active={activeCat === c.name} onClick={() => setActiveCat(c.name)}>
              {c.name}
            </Chip>
          ))}
        </div>

        {/* Tools quick filter */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={toolId === ""} onClick={() => setToolId("")}>全部工具</Chip>
          {tools.map((t) => (
            <Chip key={t.id} active={toolId === t.id} onClick={() => setToolId(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>

        <ActiveFiltersBar
          q={q}
          setQ={(v) => { setQ(v); }}
          activeCategoryName={activeCat}
          clearCategory={() => setActiveCat("全部")}
          toolId={toolId}
          tools={tools}
          clearTool={() => setToolId("")}
          filters={filters}
          setFilters={(next) => { setFilters(next); refresh(1); }}
          seriesList={seriesList}
        />

        {/* Status */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            {loading ? "加载中…" : `共 ${total} 条 · 已选 ${selected.size} 条`}
            {view === "trash" ? <span className="ml-2 font-bold text-red-600">（回收站）</span> : null}
            {err ? <span className="ml-3 text-red-600">{err}</span> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full h-8 px-4 text-xs" onClick={selectAllOnPage} disabled={!items.length}>
              全选本页
            </Button>
            <Button variant="outline" className="rounded-full h-8 px-4 text-xs" onClick={unselectAllOnPage} disabled={!items.length}>
              取消本页
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="mt-4 grid items-stretch gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((it) => {
            const checked = selected.has(it.id);
            return (
              <div key={it.id} className="relative">
                {/* selection checkbox */}
                <div
                  className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-yellow-400"
                    checked={checked}
                    onChange={(e) => toggleSelected(it.id, e.target.checked)}
                  />
                </div>

                <div
                  className="h-full cursor-pointer"
                  onClick={() => {
                    setDetailId(it.id);
                    setDetailOpen(true);
                  }}
                >
                  <Card
                    className={[
                      "h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm",
                      "flex flex-col p-0 gap-0", // 强制清除默认的 py-6 和 gap-6
                      "transition-all duration-150 ease-out",
                      "hover:-translate-y-1 hover:shadow-md hover:border-gray-300",
                      checked ? "ring-2 ring-yellow-400 border-transparent" : "",
                    ].join(" ")}
                  >
                    {/* 媒体 - 无padding，强制撑满 */}
                    <div className="relative w-full aspect-[9/16] bg-white group">
                      {it.media_type === "video" ? (
                        <video
                          className="absolute inset-0 h-full w-full object-contain"
                          src={fileUrl(it.media_url)}
                          poster={fileUrl(it.poster_url || it.thumb_url || "") || undefined}
                          preload="metadata"
                          muted
                          playsInline
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            const dur = Number.isFinite(v.duration) ? v.duration : 0;
                            if (dur > 0.1) {
                              try { v.currentTime = Math.min(0.1, dur - 0.05); } catch { }
                            }
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                      ) : (
                        <img
                          src={fileUrl(it.thumb_url || it.poster_url || it.media_url)}
                          alt={it.title}
                          className="absolute inset-0 h-full w-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                      )}
                      {/* Fallback for error */}
                      <div className="hidden absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">
                        无法加载
                      </div>

                      {/* Video indicator */}
                      {it.media_type === "video" && (
                        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-[2px]">
                          <PlayCircle className="h-3 w-3" />
                          <span>视频</span>
                        </div>
                      )}
                    </div>

                    {/* 内容区域 - 极度紧凑 */}
                    <div className="flex flex-col p-1.5 space-y-1">
                      {/* 标题 */}
                      <div className="truncate text-xs font-bold text-gray-900 leading-tight">
                        {it.series?.name_snapshot
                          ? `${it.series.name_snapshot}${it.series.delimiter_snapshot || "｜"}${it.title}`
                          : it.title}
                      </div>

                      {/* 分类（最多3个） */}
                      <div className="space-y-0.5">
                        {(() => {
                          const allCategories = [
                            { category: it.category, score: 1.0 },
                            ...(it.auto_candidates || []).filter(c => c.category.id !== it.category.id).slice(0, 2)
                          ];

                          return allCategories.map((item, idx) => {
                            const bgClass = categoryBadgeClass(item.category.name)
                              .replace('border-', 'bg-')
                              .replace(/bg-(\w+)-100/, 'bg-$1-50');

                            return (
                              <div key={item.category.id} className={`px-1 py-0.5 rounded ${bgClass}`}>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <Badge className={`h-3.5 rounded-full border px-1 text-[9px] flex-shrink-0 ${categoryBadgeClass(item.category.name)}`}>
                                      {item.category.name}
                                    </Badge>
                                    {idx === 0 && it.tags?.slice(0, 1).map((t) => (
                                      <Badge key={t} variant="secondary" className="h-3.5 rounded-full px-1 text-[9px] flex-shrink-0">
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                  {idx > 0 && item.score !== undefined && (
                                    <span className="text-[9px] text-gray-400 flex-shrink-0 scale-90 origin-right">
                                      {(item.score * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* 工具 */}
                      <div className="flex items-center gap-1 px-1 py-0.5 bg-gray-50/60 rounded">
                        <span className="text-[9px] font-medium text-gray-400 scale-90 origin-left">工具</span>
                        <Badge variant="outline" className="h-3.5 rounded-full px-1 text-[9px] border-gray-200 text-gray-600">
                          {it.tool.label}
                        </Badge>
                      </div>

                      {/* 复制按钮 */}
                      {view === "active" ? (
                        <Button
                          className="h-7 w-full rounded-md bg-yellow-300 text-yellow-950 hover:bg-yellow-200 font-bold text-xs mt-0.5 shadow-sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await navigator.clipboard.writeText(it.current_version.prompt_blob);
                            toast.success("已复制提示词");
                          }}
                        >
                          复制提示词
                        </Button>
                      ) : (
                        <Button
                          className="h-7 w-full rounded-md bg-green-100 text-green-700 hover:bg-green-200 font-bold text-xs mt-0.5 shadow-sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await restoreItem(it.id);
                              toast.success("已恢复");
                            } catch (e: any) {
                              toast.error(e?.message || String(e));
                            }
                          }}
                        >
                          恢复内容
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => refresh(page - 1)}>上一页</Button>
          <div className="text-sm text-gray-600">第 {page} 页</div>
          <Button
            variant="outline"
            disabled={loading || page * pageSize >= total}
            onClick={() => refresh(page + 1)}
          >
            下一页
          </Button>
        </div>

        <AddItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          tools={tools}
          seriesList={seriesList}
          categories={cats}
          onCreated={() => {
            refresh(1);
            toast.success("创建成功");
          }}
        />

        <ItemDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          itemId={detailId}
          categories={cats}
          onUpdated={() => refresh(page)}
        />


        <FilterDialog
          open={filterOpen}
          onOpenChange={setFilterOpen}
          series={seriesList}
          value={filters}
          onApply={(next) => {
            setFilters(next);
            refresh(1);
          }}
          onReset={() => {
            const next = { mediaType: "", seriesId: "", tagsText: "" };
            setFilters(next as FilterState);
            refresh(1);
          }}
        />

        <BulkActionBar
          selectedIds={[...selected]}
          categories={cats}
          seriesList={seriesList}
          onClear={() => clearSelected()}
          onDone={() => {
            refresh(page);
          }}
          mode={view}
        />
      </div >
    </div >
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">加载中...</div>}>
      <PageContent />
    </Suspense>
  );
}
