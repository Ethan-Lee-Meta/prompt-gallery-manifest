"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/lib/files";
import { getItem, patchItem, friendlyError } from "@/lib/api";
import type { CategoryDTO, ItemDTO } from "@/lib/types";

export function ItemDetailDialog({
    open,
    onOpenChange,
    itemId,
    categories,
    onUpdated,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    itemId: string | null;
    categories: CategoryDTO[];
    onUpdated: () => void;
}) {
    const [item, setItem] = useState<ItemDTO | null>(null);
    const [busy, setBusy] = useState(false);

    const mediaUrl = useMemo(() => (item ? fileUrl(item.media_url) : ""), [item]);
    const thumbUrl = useMemo(() => (item ? fileUrl(item.thumb_url || item.poster_url || item.media_url) : ""), [item]);

    async function refresh() {
        if (!itemId) return;
        setBusy(true);
        try {
            const data = await getItem(itemId);
            setItem(data);
        } catch (e: any) {
            toast.error(friendlyError(e));
            setItem(null);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (open) refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, itemId]);

    async function setCategory(categoryId: string) {
        if (!item) return;
        setBusy(true);
        try {
            const updated = await patchItem(item.id, { category_id: categoryId });
            setItem(updated);
            toast.success("已更新分类");
            onUpdated();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function copyPrompt() {
        if (!item) return;
        await navigator.clipboard.writeText(item.current_version.prompt_blob || "");
        toast.success("已复制提示词");
    }

    if (!itemId) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl rounded-3xl">
                <DialogHeader>
                    <DialogTitle>详情</DialogTitle>
                </DialogHeader>

                {!item ? (
                    <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-700">
                        {busy ? "加载中…" : "未能加载条目"}
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                        {/* Left: Media */}
                        <div className="rounded-3xl border bg-white p-3">
                            <div className="relative w-full overflow-hidden rounded-2xl bg-gray-100 aspect-[4/5]">
                                {item.media_type === "video" ? (
                                    <video
                                        controls
                                        className="absolute inset-0 h-full w-full object-cover"
                                        src={mediaUrl}
                                        poster={thumbUrl}
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
                                    />
                                ) : (
                                    <img
                                        src={thumbUrl}
                                        alt={item.title}
                                        className="absolute inset-0 h-full w-full object-cover"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).src = mediaUrl;
                                        }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Right: Info */}
                        <div className="space-y-3">
                            <div className="rounded-3xl border bg-white p-4">
                                {/* Title: single line */}
                                <div className="truncate text-sm font-semibold text-gray-900">
                                    {item.series?.name_snapshot
                                        ? `${item.series.name_snapshot}${item.series.delimiter_snapshot || "｜"}${item.title}`
                                        : item.title}
                                </div>

                                {/* Compact meta line: tool / series / tags summary */}
                                {(() => {
                                    const tags = item.tags || [];
                                    const tagsPreview = tags.slice(0, 3).join(" / ");
                                    const tagsMore = tags.length > 3 ? ` +${tags.length - 3}` : "";
                                    const seriesName = item.series?.name_snapshot ? item.series.name_snapshot : "无";
                                    const meta = `工具：${item.tool.label} · 系列：${seriesName} · 标签：${tags.length ? tagsPreview + tagsMore : "无"}`;

                                    return (
                                        <div className="mt-2 line-clamp-1 text-xs text-gray-600">
                                            {meta}
                                        </div>
                                    );
                                })()}

                                {/* Optional: tags expand (very compact) */}
                                <details className="mt-2">
                                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                                        查看全部标签
                                    </summary>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {(item.tags || []).length ? (
                                            (item.tags || []).map((t) => (
                                                <span key={t} className="rounded-full border bg-white px-2 py-1 text-[11px] text-gray-700">
                                                    {t}
                                                </span>
                                            ))
                                        ) : (
                                            <div className="text-xs text-gray-500">无标签</div>
                                        )}
                                    </div>
                                </details>

                                {/* Category: directly selectable */}
                                <div className="mt-4 space-y-2">
                                    <div className="text-xs font-semibold text-gray-700">分类（可直接修改）</div>
                                    <select
                                        className="w-full rounded-2xl border px-3 py-2 text-sm"
                                        value={item.category.id}
                                        onChange={(e) => setCategory(e.target.value)}
                                        disabled={busy}
                                    >
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Prompt block */}
                            <div className="rounded-3xl border bg-white p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold text-gray-700">提示词（全文）</div>
                                    <Button
                                        className="h-9 rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                        onClick={copyPrompt}
                                        disabled={busy}
                                    >
                                        复制提示词
                                    </Button>
                                </div>

                                <textarea
                                    className="mt-2 min-h-[240px] w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={item.current_version.prompt_blob || ""}
                                    readOnly
                                />
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
