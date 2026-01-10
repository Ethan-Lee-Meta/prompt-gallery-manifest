"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function downloadJson(obj: any, filename: string) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

type ScanResult = {
    status: string;
    dry_run: boolean;
    reason: string;
    scanned: number;
    missing_count: number;
    trashed?: number;
    missing_sample: any[];
};

export function MissingFilesDialog({
    open,
    onOpenChange,
    onDone,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onDone: () => void; // refresh list
}) {
    const [limit, setLimit] = useState(5000);
    const [includeDeleted, setIncludeDeleted] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);

    const [result, setResult] = useState<ScanResult | null>(null);

    const canExecute = confirm === "TRASH";

    async function call(dry_run: boolean) {
        setBusy(true);
        try {
            const res = await fetch("/api_proxy/_maintenance/trash_missing_files", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    limit,
                    include_deleted: includeDeleted,
                    dry_run,
                    reason: "missing_files_ui",
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
            setResult(data);

            if (dry_run) {
                toast.success(`扫描完成：missing=${data.missing_count}（scanned=${data.scanned}）`);
            } else {
                toast.success(`已移入回收站：trashed=${data.trashed}（missing=${data.missing_count}）`);
                onDone();
            }
        } catch (e: any) {
            toast.error(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }

    const sampleRows = useMemo(() => (result?.missing_sample || []).slice(0, 20), [result]);

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) {
                    setConfirm("");
                    setResult(null);
                }
            }}
        >
            <DialogContent className="max-w-4xl rounded-3xl">
                <DialogHeader>
                    <DialogTitle>缺失文件扫描与清理（维护）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                        该工具用于找出 media/thumb/poster 缺失的条目，并可将其批量移入回收站（软删除，可恢复）。
                        默认先 dry-run 扫描并生成报告，确认后执行。
                    </div>

                    {/* params */}
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">扫描条目数 limit</div>
                            <Input
                                type="number"
                                value={limit}
                                onChange={(e) => setLimit(Math.max(1, Math.min(200000, Number(e.target.value || 1))))}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">包含回收站条目</div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={includeDeleted}
                                    onChange={(e) => setIncludeDeleted(e.target.checked)}
                                />
                                include_deleted
                            </label>
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">操作</div>
                            <div className="flex gap-2">
                                <Button
                                    className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                    onClick={() => call(true)}
                                    disabled={busy}
                                >
                                    {busy ? "扫描中…" : "Dry-run 扫描"}
                                </Button>

                                <Button
                                    variant="outline"
                                    className="rounded-full"
                                    onClick={() => {
                                        if (!result) return toast.error("请先 Dry-run 扫描生成报告");
                                        const ts = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
                                        downloadJson(result, `missing_files_report_${ts}.json`);
                                        toast.success("报告已下载");
                                    }}
                                    disabled={!result}
                                >
                                    下载报告
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* result summary */}
                    {result ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">scanned: {result.scanned}</Badge>
                            <Badge variant="secondary" className="rounded-full">missing: {result.missing_count}</Badge>
                            <Badge variant="secondary" className="rounded-full">dry_run: {String(result.dry_run)}</Badge>
                            {typeof result.trashed === "number" ? (
                                <Badge variant="secondary" className="rounded-full">trashed: {result.trashed}</Badge>
                            ) : null}
                        </div>
                    ) : null}

                    {/* sample table */}
                    {result && sampleRows.length ? (
                        <div className="rounded-3xl border bg-white p-3">
                            <div className="mb-2 text-sm font-semibold text-gray-900">缺失样本（前 20 条）</div>
                            <div className="space-y-2">
                                {sampleRows.map((r: any) => (
                                    <div key={r.item_id} className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="rounded-full">id: {r.item_id}</Badge>
                                            <Badge variant="secondary" className="rounded-full">{r.media_type}</Badge>
                                            {r.is_deleted ? <Badge variant="outline" className="rounded-full">deleted</Badge> : null}
                                        </div>
                                        <div className="mt-1 font-semibold">{r.title}</div>
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                            <div>
                                                <div className="text-gray-500">paths</div>
                                                <div className="break-all">media: {r.paths?.media}</div>
                                                <div className="break-all">thumb: {r.paths?.thumb}</div>
                                                <div className="break-all">poster: {r.paths?.poster}</div>
                                            </div>
                                            <div>
                                                <div className="text-gray-500">exists</div>
                                                <div>media: {String(r.exists?.media)}</div>
                                                <div>thumb: {String(r.exists?.thumb)}</div>
                                                <div>poster: {String(r.exists?.poster)}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {result.missing_count > 20 ? (
                                <div className="mt-2 text-xs text-gray-600">
                                    仅展示前 20 条。完整清单请下载报告。
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {/* execute */}
                    <div className="rounded-3xl border bg-gray-50 p-4">
                        <div className="text-sm font-semibold text-gray-900">执行：将缺失文件条目移入回收站</div>
                        <div className="mt-1 text-xs text-gray-700">
                            需要先 dry-run 扫描。输入 <span className="font-semibold">TRASH</span> 确认后执行（软删除，可恢复）。
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="TRASH" />
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={() => {
                                    if (!result) return toast.error("请先 Dry-run 扫描生成报告");
                                    if (!canExecute) return toast.error('请输入 TRASH 才能执行');
                                    call(false);
                                }}
                                disabled={busy || !result}
                            >
                                {busy ? "执行中…" : "确认执行"}
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
                            关闭
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
