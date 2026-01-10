"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fileUrl } from "@/lib/files";

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

export function OrphansDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const [bucket, setBucket] = useState<"all" | "media" | "thumb" | "poster">("all");
    const [includeDeleted, setIncludeDeleted] = useState(true);
    const [maxScanFiles, setMaxScanFiles] = useState(20000);
    const [maxOrphans, setMaxOrphans] = useState(2000);

    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<any>(null);

    async function call(dry_run: boolean) {
        setBusy(true);
        try {
            const res = await fetch("/api_proxy/_maintenance/orphans", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    bucket,
                    include_deleted: includeDeleted,
                    max_scan_files: maxScanFiles,
                    max_orphans: maxOrphans,
                    dry_run,
                    confirm: dry_run ? "DRYRUN" : "DELETE",
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
            setResult(data);

            if (dry_run) {
                toast.success(`扫描完成：orphans=${data.total_orphan_count}（返回${data.orphans_returned?.length || 0}）`);
            } else {
                toast.success(`删除完成：deleted=${data.deleted} missing=${data.missing}`);
            }

            if (data.report_url) {
                // 打开报告（后端 files）
                window.open(fileUrl(data.report_url), "_blank");
            }
        } catch (e: any) {
            toast.error(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }

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
                    <DialogTitle>孤儿文件扫描与清理（维护）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                        孤儿文件指 storage/media|thumb|poster 下存在、但 DB 中没有任何条目引用的文件。
                        默认 dry-run 扫描并生成报告；执行删除需输入 DELETE 确认。
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">bucket</div>
                            <select
                                className="w-full rounded-2xl border px-3 py-2 text-sm"
                                value={bucket}
                                onChange={(e) => setBucket(e.target.value as any)}
                            >
                                <option value="all">all</option>
                                <option value="media">media</option>
                                <option value="thumb">thumb</option>
                                <option value="poster">poster</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">max_scan_files</div>
                            <Input type="number" value={maxScanFiles} onChange={(e) => setMaxScanFiles(Math.max(100, Number(e.target.value || 100)))} />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">max_orphans</div>
                            <Input type="number" value={maxOrphans} onChange={(e) => setMaxOrphans(Math.max(100, Number(e.target.value || 100)))} />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">include_deleted</div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
                                include_deleted
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                            onClick={() => call(true)}
                            disabled={busy}
                        >
                            {busy ? "扫描中…" : "Dry-run 扫描（并打开报告）"}
                        </Button>

                        <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => {
                                if (!result) return toast.error("请先 dry-run 生成报告");
                                const ts = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
                                downloadJson(result, `orphans_report_${ts}.json`);
                                toast.success("报告已下载");
                            }}
                            disabled={!result}
                        >
                            下载报告（当前结果）
                        </Button>
                    </div>

                    {result ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">referenced: {result.referenced_count}</Badge>
                            <Badge variant="secondary" className="rounded-full">scanned_files: {result.total_scanned_files}</Badge>
                            <Badge variant="secondary" className="rounded-full">orphans_total: {result.total_orphan_count}</Badge>
                            <Badge variant="secondary" className="rounded-full">returned: {result.orphans_returned?.length || 0}</Badge>
                            <Badge variant="secondary" className="rounded-full">dry_run: {String(result.dry_run)}</Badge>
                        </div>
                    ) : null}

                    <div className="rounded-3xl border bg-gray-50 p-4">
                        <div className="text-sm font-semibold text-gray-900">执行删除（不可恢复）</div>
                        <div className="mt-1 text-xs text-gray-700">
                            输入 <span className="font-semibold">DELETE</span> 确认后，将删除本次扫描返回的 orphans_returned（受 max_orphans 限制，可多次执行）。
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={() => {
                                    if (!result) return toast.error("请先 dry-run 生成报告");
                                    if (confirm !== "DELETE") return toast.error('请输入 DELETE 才能执行');
                                    call(false);
                                }}
                                disabled={busy || !result}
                            >
                                {busy ? "执行中…" : "确认删除"}
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
