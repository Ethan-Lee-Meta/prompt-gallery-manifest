"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMaintenanceConfig } from "@/lib/api";

export function ReclassifyDialog({
    open,
    onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const [limit, setLimit] = useState(5000);
    const [threshold, setThreshold] = useState(0.32);
    const [includeDeleted, setIncludeDeleted] = useState(true);
    const [onlyUncat, setOnlyUncat] = useState(true);
    const [force, setForce] = useState(false);

    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [confirm, setConfirm] = useState("");

    const [cfg, setCfg] = useState<any>(null);
    const [cfgLoaded, setCfgLoaded] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (cfgLoaded) return;

        (async () => {
            try {
                const config = await getMaintenanceConfig();
                const ac = config?.auto_category;
                if (!ac) return;

                setThreshold(Number(ac.threshold ?? 0.32));
                setCfg(config);
                setCfgLoaded(true);
            } catch (e: any) {
                toast.error(e?.message || String(e));
                setCfgLoaded(true);
            }
        })();
    }, [open, cfgLoaded]);

    async function run(dry_run: boolean) {
        setBusy(true);
        try {
            const res = await fetch("/api_proxy/_maintenance/reclassify_items", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    limit,
                    threshold,
                    include_deleted: includeDeleted,
                    only_uncategorized: onlyUncat,
                    force,
                    dry_run,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
            setResult(data);
            toast.success(dry_run ? `DRYRUN: would_update=${data.would_update}` : `APPLY: applied=${data.applied}`);
        } catch (e: any) {
            toast.error(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => {
            onOpenChange(v);
            if (!v) {
                setResult(null);
                setConfirm("");
                setCfgLoaded(false);
            }
        }}>
            <DialogContent className="max-w-4xl rounded-3xl">
                <DialogHeader>
                    <DialogTitle>自动分类重算（维护）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                        默认只会改“未分类”条目，并刷新 auto_candidates/top1 分数。建议先 DRYRUN 查看样本后再执行。
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                            <div className="text-xs font-semibold">limit</div>
                            <Input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value || 1))} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs font-semibold">threshold</div>
                            <Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 0.32))} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs font-semibold">include_deleted</div>
                            <label className="mt-2 flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
                                include_deleted
                            </label>
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs font-semibold">策略</div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={onlyUncat} onChange={(e) => setOnlyUncat(e.target.checked)} />
                                仅重分“未分类”
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                                强制覆盖（危险）
                            </label>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={() => run(true)} disabled={busy}>
                            DRYRUN
                        </Button>
                    </div>

                    {cfg?.auto_category ? (
                        <div className="rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                            <div className="font-semibold text-gray-800">后端当前 auto_category 配置</div>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
                                {JSON.stringify(cfg.auto_category, null, 2)}
                            </pre>
                        </div>
                    ) : null}

                    {result ? (
                        <div className="rounded-2xl border bg-white p-3 text-xs text-gray-700">
                            <div>scanned: {result.scanned}</div>
                            <div>would_update: {result.would_update}</div>
                            <div>uncategorized_id: {result.uncategorized_id}</div>
                            <div className="mt-2 font-semibold">sample（前 10 条）</div>
                            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-2">
                                {JSON.stringify((result.sample || []).slice(0, 10), null, 2)}
                            </pre>
                        </div>
                    ) : null}

                    <div className="rounded-2xl border bg-gray-50 p-3">
                        <div className="text-sm font-semibold text-gray-900">执行（需要确认）</div>
                        <div className="mt-1 text-xs text-gray-700">输入 APPLY 后执行实际写库。</div>
                        <div className="mt-2 flex gap-2">
                            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APPLY" />
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                disabled={busy || !result}
                                onClick={() => {
                                    if (confirm !== "APPLY") return toast.error("请输入 APPLY 才能执行");
                                    run(false);
                                }}
                            >
                                APPLY
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
