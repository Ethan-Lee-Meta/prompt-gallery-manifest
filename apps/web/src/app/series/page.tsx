"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Copy, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { SeriesDTO, SeriesVersionDTO } from "@/lib/types";
import {
    friendlyError,
    listSeries,
    createSeries,
    patchSeries,
    listSeriesVersions,
    createSeriesVersion,
    deleteSeries,
    restoreSeries,
    purgeSeries,
    purgeDeletedSeries,
} from "@/lib/api";

async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
}

function tagsToText(tags: string[]) {
    return (tags || []).join(", ");
}

export default function SeriesPage() {
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<SeriesDTO[]>([]);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<"active" | "trash">("active");

    // dialogs
    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editSeries, setEditSeries] = useState<SeriesDTO | null>(null);

    const [versionsOpen, setVersionsOpen] = useState(false);
    const [versions, setVersions] = useState<SeriesVersionDTO[]>([]);
    const [versionsSeries, setVersionsSeries] = useState<SeriesDTO | null>(null);

    // create form
    const [cName, setCName] = useState("");
    const [cDelim, setCDelim] = useState("｜");
    const [cBase, setCBase] = useState("");
    const [cTags, setCTags] = useState("");

    // edit form
    const [eName, setEName] = useState("");
    const [eDelim, setEDelim] = useState("｜");
    const [eTags, setETags] = useState("");

    // new version form
    const [nvBlob, setNvBlob] = useState("");
    const [nvNote, setNvNote] = useState("");

    async function refresh() {
        setBusy(true);
        try {
            const data = await listSeries(
                q || undefined,
                view === "trash" ? { include_deleted: 1, only_deleted: 1 } : undefined
            );
            setRows(data);
        } catch (e: any) {
            toast.error(friendlyError(e));
            setRows([]);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        const t = setTimeout(() => refresh(), 200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, view]);

    useEffect(() => {
        refresh();
    }, []);

    function openEdit(s: SeriesDTO) {
        setEditSeries(s);
        setEName(s.name);
        setEDelim(s.delimiter);
        setETags(tagsToText(s.tags));
        setEditOpen(true);
    }

    async function openVersions(s: SeriesDTO) {
        setVersionsSeries(s);
        setVersionsOpen(true);
        setNvBlob(s.current_version.base_prompt_blob || "");
        setNvNote("");
        try {
            const vs = await listSeriesVersions(s.id);
            setVersions(vs);
        } catch (e: any) {
            toast.error(friendlyError(e));
            setVersions([]);
        }
    }

    async function onCreate() {
        const name = cName.trim();
        if (!name) return toast.error("系列名不能为空");
        setBusy(true);
        try {
            await createSeries({
                name,
                delimiter: cDelim || "｜",
                base_prompt_blob: cBase || "",
                tags: cTags.split(",").map(s => s.trim()).filter(Boolean),
            });
            toast.success("已创建系列");
            setCreateOpen(false);
            setCName(""); setCDelim("｜"); setCBase(""); setCTags("");
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onSaveEdit() {
        if (!editSeries) return;
        setBusy(true);
        try {
            const updated = await patchSeries(editSeries.id, {
                name: eName.trim() || undefined,
                delimiter: eDelim || "｜",
                tags: eTags.split(",").map(s => s.trim()).filter(Boolean),
            });
            toast.success("已更新系列信息");
            setEditOpen(false);
            setEditSeries(updated);
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onCreateNewVersion() {
        if (!versionsSeries) return;
        const blob = nvBlob;
        if (!blob.trim()) return toast.error("Base Prompt 不能为空");
        setBusy(true);
        try {
            await createSeriesVersion(versionsSeries.id, { base_prompt_blob: blob, note: nvNote || undefined });
            toast.success("已创建新版本");
            const s = await listSeries(); // refresh list to get current_version v updated
            setRows(s);
            const vs = await listSeriesVersions(versionsSeries.id);
            setVersions(vs);
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onDeleteSeries(s: SeriesDTO) {
        if (!confirm(`确定将系列“${s.name}”移入回收站吗？`)) return;
        setBusy(true);
        try {
            await deleteSeries(s.id);
            toast.success("已移入回收站");
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onRestoreSeries(s: SeriesDTO) {
        setBusy(true);
        try {
            await restoreSeries(s.id);
            toast.success("已恢复系列");
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onPurgeSeries(s: SeriesDTO) {
        if (!confirm(`确定永久删除系列“${s.name}”吗？该操作不可恢复。`)) return;
        setBusy(true);
        try {
            await purgeSeries(s.id);
            toast.success("已永久删除");
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    async function onPurgeAll() {
        if (!confirm("确定清空回收站里的所有系列吗？该操作不可恢复。")) return;
        setBusy(true);
        try {
            const res = await purgeDeletedSeries(20000);
            const total = res.deleted?.series ?? 0;
            toast.success(`回收站已清空：${total} 个系列`);
            refresh();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="relative w-full md:max-w-xl">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="搜索系列名…"
                            className="h-11 rounded-full pl-10"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant={view === "active" ? "secondary" : "outline"}
                            className="h-11 rounded-full"
                            onClick={() => setView("active")}
                        >
                            全部
                        </Button>
                        <Button
                            variant={view === "trash" ? "secondary" : "outline"}
                            className="h-11 rounded-full"
                            onClick={() => setView("trash")}
                        >
                            回收站
                        </Button>
                        {view === "trash" ? (
                            <Button
                                variant="outline"
                                className="h-11 rounded-full text-red-600 hover:text-red-700"
                                onClick={onPurgeAll}
                                disabled={busy || rows.length === 0}
                            >
                                清空回收站
                            </Button>
                        ) : null}
                        <Button
                            className="h-11 rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                            onClick={() => setCreateOpen(true)}
                            disabled={view === "trash"}
                        >
                            <Plus className="mr-2 h-4 w-4" /> 新建系列
                        </Button>
                    </div>
                </div>

                <div className="mt-4 text-sm text-gray-600">
                    {busy ? "加载中…" : `共 ${rows.length} 个系列`}
                    {view === "trash" ? <span className="ml-2 font-bold text-red-600">（回收站）</span> : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {rows.map((s) => (
                        <div key={s.id} className="rounded-3xl border bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                                    <div className="mt-1 text-xs text-gray-500">delimiter: {s.delimiter} · current v{s.current_version.v}</div>
                                </div>
                                <div className="flex gap-2">
                                    {view === "trash" ? (
                                        <>
                                            <Button
                                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                                onClick={() => onRestoreSeries(s)}
                                                disabled={busy}
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />恢复
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-full text-red-600 hover:text-red-700"
                                                onClick={() => onPurgeSeries(s)}
                                                disabled={busy}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />永久删除
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button variant="outline" className="rounded-full" onClick={() => openEdit(s)} disabled={busy}>
                                                编辑
                                            </Button>
                                            <Button variant="outline" className="rounded-full" onClick={() => openVersions(s)} disabled={busy}>
                                                版本
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-full text-red-600 hover:text-red-700"
                                                onClick={() => onDeleteSeries(s)}
                                                disabled={busy}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />删除
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {(s.tags || []).slice(0, 6).map((t) => (
                                    <Badge key={t} variant="secondary" className="rounded-full">{t}</Badge>
                                ))}
                            </div>

                            <div className="mt-3 rounded-2xl border bg-gray-50 p-3">
                                <div className="text-xs font-semibold text-gray-700">Base Prompt（当前版本）</div>
                                <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-700">
                                    {s.current_version.base_prompt_blob}
                                </div>
                                <div className="mt-2">
                                    <Button
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={async () => { await copyToClipboard(s.current_version.base_prompt_blob || ""); toast.success("已复制 Base Prompt"); }}
                                    >
                                        <Copy className="mr-2 h-4 w-4" />复制
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Create dialog */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="max-w-2xl rounded-3xl">
                        <DialogHeader><DialogTitle>新建系列</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">系列名</div>
                                    <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="例如：女子海边电影风格肖像照" />
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">分隔符</div>
                                    <Input value={cDelim} onChange={(e) => setCDelim(e.target.value)} placeholder="｜" />
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-gray-700">Base Prompt（单文本块）</div>
                                <textarea className="min-h-[180px] w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={cBase} onChange={(e) => setCBase(e.target.value)} />
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-gray-700">Tags（逗号分隔）</div>
                                <Input value={cTags} onChange={(e) => setCTags(e.target.value)} placeholder="portrait, cinematic" />
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)}>取消</Button>
                                <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={onCreate} disabled={busy}>
                                    创建
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Edit dialog */}
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogContent className="max-w-xl rounded-3xl">
                        <DialogHeader><DialogTitle>编辑系列</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                            <div>
                                <div className="text-xs font-semibold text-gray-700">系列名</div>
                                <Input value={eName} onChange={(e) => setEName(e.target.value)} />
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-700">分隔符</div>
                                <Input value={eDelim} onChange={(e) => setEDelim(e.target.value)} />
                            </div>
                            <div>
                                <div className="text-xs font-semibold text-gray-700">Tags（逗号分隔）</div>
                                <Input value={eTags} onChange={(e) => setETags(e.target.value)} />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" className="rounded-full" onClick={() => setEditOpen(false)}>取消</Button>
                                <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={onSaveEdit} disabled={busy}>
                                    保存
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Versions dialog */}
                <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
                    <DialogContent className="max-w-4xl rounded-3xl">
                        <DialogHeader>
                            <DialogTitle>系列版本：{versionsSeries?.name || ""}</DialogTitle>
                        </DialogHeader>

                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">新建 Base Prompt 版本</div>
                                <textarea className="min-h-[260px] w-full rounded-2xl border px-3 py-2 text-sm"
                                    value={nvBlob} onChange={(e) => setNvBlob(e.target.value)} />
                                <Input value={nvNote} onChange={(e) => setNvNote(e.target.value)} placeholder="版本说明（可空）" />
                                <div className="flex justify-end">
                                    <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={onCreateNewVersion} disabled={busy}>
                                        创建新版本
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-semibold text-gray-700">版本历史</div>
                                <div className="max-h-[380px] overflow-auto space-y-2 pr-1">
                                    {versions.map((v) => (
                                        <div key={v.id} className="rounded-2xl border bg-white p-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="font-semibold">v{v.v}</div>
                                                <div className="text-gray-500">{v.created_at}</div>
                                            </div>
                                            {v.note ? <div className="mt-1 text-xs text-gray-600">{v.note}</div> : null}
                                            <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-700">
                                                {v.base_prompt_blob}
                                            </div>
                                            <div className="mt-2">
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full"
                                                    onClick={async () => { await copyToClipboard(v.base_prompt_blob || ""); toast.success(`已复制 v${v.v}`); }}
                                                >
                                                    <Copy className="mr-2 h-4 w-4" />复制该版本
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
