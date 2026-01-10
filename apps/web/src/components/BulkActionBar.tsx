"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Tags, FolderTree, X, Layers, Trash2, RotateCcw } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { CategoryDTO, SeriesDTO } from "@/lib/types";
import { bulkPatchItems, bulkTrash, bulkRestore, bulkPurge, friendlyError } from "@/lib/api";

function parseTags(s: string) {
    return s.split(",").map(x => x.trim()).filter(Boolean);
}

export function BulkActionBar({
    selectedIds,
    categories,
    seriesList,
    onClear,
    onDone,
    mode = "active",
}: {
    selectedIds: string[];
    categories: CategoryDTO[];
    seriesList: SeriesDTO[];
    onClear: () => void;
    onDone: () => void; // refresh
    mode: "active" | "trash";
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    // bulk forms
    const [catId, setCatId] = useState<string>("");
    const [seriesId, setSeriesId] = useState<string>("");     // "" = no change (UI)
    const [clearSeries, setClearSeries] = useState(false);

    const [tagsSet, setTagsSet] = useState("");
    const [tagsAdd, setTagsAdd] = useState("");
    const [tagsRemove, setTagsRemove] = useState("");

    // purge states
    const [purgeOpen, setPurgeOpen] = useState(false);
    const [purgeConfirm, setPurgeConfirm] = useState("");
    const [purgeFiles, setPurgeFiles] = useState(true);

    const count = selectedIds.length;

    async function applyPatch(body: any) {
        setBusy(true);
        try {
            const res = await bulkPatchItems(body);
            toast.success(`批量更新完成：updated=${res.updated} missing=${res.missing_item_ids.length}`);
            if (res.missing_item_ids.length) console.log("missing ids:", res.missing_item_ids);
            setOpen(false);
            onDone();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onBulkTrash() {
        if (!confirm(`确定要将选中的 ${count} 条移入回收站吗？`)) return;
        setBusy(true);
        try {
            await bulkTrash(selectedIds);
            toast.success("已移入回收站");
            onClear();
            onDone();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onBulkRestore() {
        setBusy(true);
        try {
            await bulkRestore(selectedIds);
            toast.success("已从回收站恢复");
            onClear();
            onDone();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    if (!count) return null;

    return (
        <>
            {/* fixed bar */}
            <div className="fixed bottom-4 left-1/2 z-50 w-[min(100%,_980px)] -translate-x-1/2 px-4">
                <div className="flex flex-col gap-2 rounded-3xl border bg-white/95 p-3 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="rounded-full px-3 py-2 text-sm">
                            已选 {count} 条
                        </Badge>
                        <Button variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
                            <Layers className="mr-2 h-4 w-4" /> 批量操作
                        </Button>
                        {mode === "active" ? (
                            <Button variant="outline" className="rounded-full text-red-600 hover:text-red-700" onClick={onBulkTrash} disabled={busy}>
                                <Trash2 className="mr-2 h-4 w-4" /> 移入回收站
                            </Button>
                        ) : (
                            <>
                                <Button
                                    className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                    onClick={onBulkRestore}
                                    disabled={busy}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" /> 批量恢复
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-full text-red-600 hover:text-red-700"
                                    onClick={() => {
                                        setPurgeConfirm("");
                                        setPurgeFiles(true);
                                        setPurgeOpen(true);
                                    }}
                                    disabled={busy}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" /> 永久删除
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" className="rounded-full" onClick={onClear}>
                            <X className="mr-2 h-4 w-4" /> 清空选择
                        </Button>
                    </div>
                </div>
            </div>

            {/* dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>批量操作（{count} 条）</DialogTitle>
                    </DialogHeader>

                    <Tabs defaultValue="category">
                        <TabsList className="w-full">
                            <TabsTrigger value="category" className="flex-1">
                                <FolderTree className="mr-2 h-4 w-4" /> 分类/系列
                            </TabsTrigger>
                            <TabsTrigger value="tags" className="flex-1">
                                <Tags className="mr-2 h-4 w-4" /> Tags
                            </TabsTrigger>
                        </TabsList>

                        {/* Category / Series */}
                        <TabsContent value="category" className="space-y-4">
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">批量设置分类（可选）</div>
                                <select
                                    className="w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={catId}
                                    onChange={(e) => setCatId(e.target.value)}
                                >
                                    <option value="">（不修改）</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">批量设置系列（可选）</div>
                                <div className="flex flex-wrap gap-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={clearSeries} onChange={(e) => setClearSeries(e.target.checked)} />
                                        清空系列（优先于下拉选择）
                                    </label>
                                </div>
                                <select
                                    className="w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={seriesId}
                                    onChange={(e) => setSeriesId(e.target.value)}
                                    disabled={clearSeries}
                                >
                                    <option value="">（不修改）</option>
                                    {seriesList.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>
                                    取消
                                </Button>
                                <Button
                                    className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                    disabled={busy || (!catId && !clearSeries && !seriesId)}
                                    onClick={() => {
                                        const body: any = { item_ids: selectedIds };
                                        if (catId) body.category_id = catId;
                                        if (clearSeries) body.series_id = "";
                                        else if (seriesId) body.series_id = seriesId;
                                        applyPatch(body);
                                    }}
                                >
                                    应用
                                </Button>
                            </div>
                        </TabsContent>

                        {/* Tags */}
                        <TabsContent value="tags" className="space-y-4">
                            <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-600">
                                规则：如果填写「Replace」，将直接替换所有 tags；否则按 Add/Remove 对现有 tags 做增量更新。
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">Replace tags（逗号分隔，可空）</div>
                                <input
                                    className="w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={tagsSet}
                                    onChange={(e) => setTagsSet(e.target.value)}
                                    placeholder="portrait, cinematic"
                                />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold text-gray-700">Add tags（逗号分隔）</div>
                                    <input
                                        className="w-full rounded-2xl border px-3 py-2 text-sm"
                                        value={tagsAdd}
                                        onChange={(e) => setTagsAdd(e.target.value)}
                                        placeholder="new_tag"
                                        disabled={!!tagsSet.trim()}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs font-semibold text-gray-700">Remove tags（逗号分隔）</div>
                                    <input
                                        className="w-full rounded-2xl border px-3 py-2 text-sm"
                                        value={tagsRemove}
                                        onChange={(e) => setTagsRemove(e.target.value)}
                                        placeholder="old_tag"
                                        disabled={!!tagsSet.trim()}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>
                                    取消
                                </Button>
                                <Button
                                    className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                    disabled={busy || (!tagsSet.trim() && !tagsAdd.trim() && !tagsRemove.trim())}
                                    onClick={() => {
                                        const body: any = { item_ids: selectedIds };
                                        if (tagsSet.trim()) body.tags_set = parseTags(tagsSet);
                                        else {
                                            if (tagsAdd.trim()) body.tags_add = parseTags(tagsAdd);
                                            if (tagsRemove.trim()) body.tags_remove = parseTags(tagsRemove);
                                        }
                                        applyPatch(body);
                                    }}
                                >
                                    应用
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
                <DialogContent className="max-w-lg rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>永久删除（选中 {count} 条）</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                            该操作会永久删除选中的回收站条目（数据库行 + 版本/标签/向量），并可选删除本地文件。不可恢复。
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={purgeFiles} onChange={(e) => setPurgeFiles(e.target.checked)} />
                            同时删除本地文件（media/thumb/poster）
                        </label>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">输入 PURGE 确认</div>
                            <Input value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} placeholder="PURGE" />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" className="rounded-full" onClick={() => setPurgeOpen(false)} disabled={busy}>
                                取消
                            </Button>
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={async () => {
                                    if (purgeConfirm !== "PURGE") {
                                        toast.error('请输入 PURGE 才能执行');
                                        return;
                                    }
                                    try {
                                        setBusy(true);
                                        const res = await bulkPurge(selectedIds, purgeFiles);
                                        toast.success(`永久删除完成：items=${res.deleted.items} files=${res.deleted.files_deleted}`);
                                        if (res.skipped?.not_deleted_items?.length) console.log("not_deleted_items:", res.skipped.not_deleted_items);
                                        if (res.skipped?.missing_items?.length) console.log("missing_items:", res.skipped.missing_items);
                                        if (res.errors_sample?.length) console.log("purge errors:", res.errors_sample);

                                        setPurgeOpen(false);
                                        onClear();
                                        onDone();
                                    } catch (e: any) {
                                        toast.error(friendlyError(e));
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                                disabled={busy}
                            >
                                {busy ? "执行中…" : "永久删除"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
