"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function StorageVerifyDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const [limit, setLimit] = useState(2000);
    const [includeDeleted, setIncludeDeleted] = useState(true);
    const [scanFiles, setScanFiles] = useState(false);
    const [maxFiles, setMaxFiles] = useState(5000);
    const [busy, setBusy] = useState(false);

    async function run() {
        setBusy(true);
        try {
            const sp = new URLSearchParams();
            sp.set("limit", String(limit));
            sp.set("include_deleted", includeDeleted ? "1" : "0");
            sp.set("scan_files", scanFiles ? "1" : "0");
            sp.set("max_files", String(maxFiles));

            const res = await fetch(`/api_proxy/_maintenance/verify_storage?${sp.toString()}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

            const ts = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
            downloadJson(data, `storage_verify_${ts}.json`);

            toast.success(
                `报告已下载：missing_media=${data.counts.missing_media}, missing_thumb=${data.counts.missing_thumb}, missing_poster=${data.counts.missing_poster}`
            );

            if (data.orphans?.enabled) {
                console.log("orphans sample:", data.orphans.orphan_sample);
            }
            console.log("verify_storage report:", data);

            onOpenChange(false);
        } catch (e: any) {
            toast.error(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-3xl">
                <DialogHeader>
                    <DialogTitle>下载存储自检报告（维护）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                        生成 JSON 报告：检查 DB 路径对应的文件是否存在，并可选扫描 storage 目录找“孤儿文件”（未被引用）。扫描孤儿文件可能较慢。
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">扫描条目数 limit</div>
                        <Input type="number" value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(50000, Number(e.target.value || 1))))} />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
                        包含回收站条目（include_deleted）
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={scanFiles} onChange={(e) => setScanFiles(e.target.checked)} />
                        扫描 storage 目录找孤儿文件（scan_files）
                    </label>

                    {scanFiles ? (
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">孤儿扫描上限 max_files（每个目录）</div>
                            <Input type="number" value={maxFiles} onChange={(e) => setMaxFiles(Math.max(100, Math.min(200000, Number(e.target.value || 100))))} />
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
                            取消
                        </Button>
                        <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={run} disabled={busy}>
                            {busy ? "生成中…" : "生成并下载"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
