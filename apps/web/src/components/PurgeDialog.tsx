"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { purgeDeleted, friendlyError } from "@/lib/api";

export function PurgeDialog({
    open,
    onOpenChange,
    onDone,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onDone: () => void;
}) {
    const [confirm, setConfirm] = useState("");
    const [limit, setLimit] = useState(200);
    const [purgeFiles, setPurgeFiles] = useState(true);
    const [busy, setBusy] = useState(false);

    async function onSubmit() {
        if (confirm !== "PURGE") {
            toast.error('请输入 PURGE 才能执行');
            return;
        }
        setBusy(true);
        try {
            const res = await purgeDeleted({ confirm: "PURGE", limit, purge_files: purgeFiles });
            toast.success(`永久清理完成：items=${res.deleted.items}, files=${res.deleted.files_deleted}, missing_files=${res.deleted.files_missing}`);
            if (res.errors_sample?.length) console.log("purge errors:", res.errors_sample);
            onOpenChange(false);
            onDone();
        } catch (e: any) {
            toast.error(friendlyError(e));
        } finally {
            setBusy(false);
            setConfirm("");
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-3xl">
                <DialogHeader>
                    <DialogTitle>永久删除（维护）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                        该操作会永久删除回收站里的条目（数据库行 + 相关版本/标签/向量），并可选删除 media/thumb/poster 文件。不可恢复。建议先备份 app.db。
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">一次最多清理条数（limit）</div>
                        <Input
                            type="number"
                            value={limit}
                            onChange={(e) => setLimit(Math.max(1, Math.min(50000, Number(e.target.value || 1))))}
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={purgeFiles} onChange={(e) => setPurgeFiles(e.target.checked)} />
                        同时删除本地文件（media/thumb/poster）
                    </label>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700">输入 PURGE 确认</div>
                        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="PURGE" />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
                            取消
                        </Button>
                        <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={onSubmit} disabled={busy}>
                            {busy ? "执行中…" : "永久删除"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
