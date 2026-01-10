"use client";

import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeriesDTO } from "@/lib/types";

export type FilterState = {
    mediaType: "" | "image" | "video";
    seriesId: string;     // "" = all
    tagsText: string;     // comma-separated
};

function parseTags(tagsText: string) {
    return tagsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function FilterDialog({
    open,
    onOpenChange,
    series,
    value,
    onApply,
    onReset,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    series: SeriesDTO[];
    value: FilterState;
    onApply: (next: FilterState) => void;
    onReset: () => void;
}) {
    const [draft, setDraft] = useState<FilterState>(value);

    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    const tags = useMemo(() => parseTags(draft.tagsText), [draft.tagsText]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl rounded-3xl">
                <DialogHeader>
                    <DialogTitle>筛选</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Media type */}
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">媒体类型</div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { k: "", label: "全部" },
                                { k: "image", label: "图片" },
                                { k: "video", label: "视频" },
                            ].map((x) => (
                                <button
                                    key={x.k}
                                    onClick={() => setDraft((d) => ({ ...d, mediaType: x.k as any }))}
                                    className={`rounded-full border px-3 py-2 text-sm ${draft.mediaType === x.k
                                            ? "border-yellow-400 bg-yellow-200 text-yellow-950"
                                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                        }`}
                                >
                                    {x.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Series */}
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">系列</div>
                        <select
                            className="w-full rounded-2xl border px-3 py-2 text-sm"
                            value={draft.seriesId}
                            onChange={(e) => setDraft((d) => ({ ...d, seriesId: e.target.value }))}
                        >
                            <option value="">（全部系列）</option>
                            {series.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}（v{s.current_version.v}）
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Tags AND */}
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">Tags（AND 语义，逗号分隔）</div>
                        <input
                            className="w-full rounded-2xl border px-3 py-2 text-sm"
                            value={draft.tagsText}
                            onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))}
                            placeholder="portrait, cinematic"
                        />
                        {tags.length ? (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((t) => (
                                    <Badge key={t} variant="secondary" className="rounded-full">
                                        {t}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500">不填则不过滤 tags。</div>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <Button variant="outline" className="rounded-full" onClick={onReset}>
                            重置
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
                                取消
                            </Button>
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={() => {
                                    onApply(draft);
                                    onOpenChange(false);
                                }}
                            >
                                应用
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-600">
                        Tags 过滤为 AND：同时具备所有 tags 的条目才会出现。
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
