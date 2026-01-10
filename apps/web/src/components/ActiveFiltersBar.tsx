"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CategoryDTO, ToolDTO, SeriesDTO } from "@/lib/types";
import type { FilterState } from "@/components/FilterDialog";

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <Badge variant="secondary" className="rounded-full px-3 py-2 text-sm">
            <span className="mr-2">{label}</span>
            <button onClick={onClear} className="rounded-full p-1 hover:bg-black/5" type="button">
                <X className="h-3 w-3" />
            </button>
        </Badge>
    );
}

export function ActiveFiltersBar({
    q,
    setQ,
    activeCategoryName,
    clearCategory,
    toolId,
    tools,
    clearTool,
    filters,
    setFilters,
    seriesList,
}: {
    q: string;
    setQ: (v: string) => void;

    activeCategoryName: string; // "全部" or actual
    clearCategory: () => void;

    toolId: string; // "" = all
    tools: ToolDTO[];
    clearTool: () => void;

    filters: FilterState;
    setFilters: (v: FilterState) => void;
    seriesList: SeriesDTO[];
}) {
    const toolLabel = tools.find((t) => t.id === toolId)?.label;
    const seriesName = seriesList.find((s) => s.id === filters.seriesId)?.name;

    const tags = filters.tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const chips: { key: string; label: string; onClear: () => void }[] = [];

    if (q.trim()) chips.push({ key: "q", label: `搜索：${q.trim()}`, onClear: () => setQ("") });
    if (activeCategoryName !== "全部") chips.push({ key: "cat", label: `分类：${activeCategoryName}`, onClear: clearCategory });
    if (toolId && toolLabel) chips.push({ key: "tool", label: `工具：${toolLabel}`, onClear: clearTool });
    if (filters.mediaType) chips.push({ key: "media", label: `媒体：${filters.mediaType === "image" ? "图片" : "视频"}`, onClear: () => setFilters({ ...filters, mediaType: "" }) });
    if (filters.seriesId && seriesName) chips.push({ key: "series", label: `系列：${seriesName}`, onClear: () => setFilters({ ...filters, seriesId: "" }) });
    for (const t of tags) {
        chips.push({
            key: `tag:${t}`,
            label: `tag：${t}`,
            onClear: () => {
                const next = tags.filter((x) => x !== t).join(", ");
                setFilters({ ...filters, tagsText: next });
            },
        });
    }

    if (!chips.length) return null;

    return (
        <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
                <Chip key={c.key} label={c.label} onClear={c.onClear} />
            ))}
        </div>
    );
}
