"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, RefreshCcw, ShieldAlert, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { StorageVerifyDialog } from "@/components/StorageVerifyDialog";
import { MissingFilesDialog } from "@/components/MissingFilesDialog";
import { OrphansDialog } from "@/components/OrphansDialog";
import { PurgeDialog } from "@/components/PurgeDialog";
import { ReclassifyDialog } from "@/components/ReclassifyDialog";

import { fileUrl } from "@/lib/files";

type Diag = any;

function Card({
    title,
    desc,
    children,
}: {
    title: string;
    desc?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-gray-900">{title}</div>
                    {desc ? <div className="mt-1 text-xs text-gray-600">{desc}</div> : null}
                </div>
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}

async function apiJson(path: string, init?: RequestInit) {
    const res = await fetch(`/api_proxy${path}`, init);
    const rid = res.headers.get("x-request-id");
    let data: any = null;
    try {
        data = await res.json();
    } catch {
        // ignore
    }
    if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        const code = data?.error?.code || "HTTP_ERROR";
        throw new Error(`${code}: ${msg}${rid ? ` (request_id=${rid})` : ""}`);
    }
    return data;
}

export default function MaintenancePage() {
    // dialogs
    const [verifyOpen, setVerifyOpen] = useState(false);
    const [missingOpen, setMissingOpen] = useState(false);
    const [orphansOpen, setOrphansOpen] = useState(false);
    const [purgeOpen, setPurgeOpen] = useState(false);
    const [reclassOpen, setReclassOpen] = useState(false);

    // diag
    const [diag, setDiag] = useState<Diag | null>(null);
    const [busy, setBusy] = useState(false);

    // forms
    const [shaLimit, setShaLimit] = useState(5000);
    const [shaIncludeDeleted, setShaIncludeDeleted] = useState(true);

    const [mojiLimit, setMojiLimit] = useState(20000);
    const [mojiIncludeDeleted, setMojiIncludeDeleted] = useState(true);


    const diagBadges = useMemo(() => {
        if (!diag) return [];
        const out: { k: string; v: any }[] = [];
        if (diag.counts?.items !== undefined) out.push({ k: "items", v: diag.counts.items });
        if (diag.counts?.series !== undefined) out.push({ k: "series", v: diag.counts.series });
        if (diag.counts?.item_versions !== undefined) out.push({ k: "item_versions", v: diag.counts.item_versions });
        if (diag.fts?.exists !== undefined) out.push({ k: "fts", v: diag.fts.exists ? `ok (${diag.fts.rows})` : "missing" });
        if (diag.recent_missing_files !== undefined) out.push({ k: "recent_missing_files", v: diag.recent_missing_files });
        return out;
    }, [diag]);

    async function refreshDiag() {
        setBusy(true);
        try {
            const d = await apiJson("/_maintenance/diag");
            setDiag(d);
        } catch (e: any) {
            toast.error(e?.message || String(e));
            setDiag(null);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        refreshDiag();
    }, []);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="text-lg font-semibold text-gray-900">Maintenance Console</div>
                        <div className="mt-1 text-xs text-gray-600">
                            统一维护入口：自检、修复、清理。默认保持安全：先 dry-run/报告，再确认执行。
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="rounded-full" onClick={() => (window.location.href = "/")}>
                            返回首页
                        </Button>
                        <Button variant="outline" className="rounded-full" onClick={refreshDiag} disabled={busy}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            刷新状态
                        </Button>
                    </div>
                </div>

                {/* DIAG summary */}
                <div className="mt-4 rounded-3xl border bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">status: {diag?.status || "unknown"}</Badge>
                            {diag?.storage?.root ? (
                                <Badge variant="outline" className="rounded-full">storage: {diag.storage.root}</Badge>
                            ) : null}
                            {diag?.db?.url ? (
                                <Badge variant="outline" className="rounded-full">db: {String(diag.db.url).slice(0, 80)}…</Badge>
                            ) : null}
                        </div>
                        <div className="text-xs text-gray-600">{busy ? "加载中…" : diag?.now_utc || ""}</div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {diagBadges.map((b) => (
                            <Badge key={b.k} variant="secondary" className="rounded-full">
                                {b.k}: {String(b.v)}
                            </Badge>
                        ))}
                    </div>

                    {diag?.recent_sample?.length ? (
                        <div className="mt-3 rounded-2xl border bg-gray-50 p-3 text-xs text-gray-700">
                            <div className="font-semibold text-gray-800">最近条目样本（用于快速判断缺失文件）</div>
                            <div className="mt-2 space-y-1">
                                {diag.recent_sample.slice(0, 3).map((x: any) => (
                                    <div key={x.id} className="break-all">
                                        {x.id} · {x.title} · exists(media={String(x.exists?.media)} thumb={String(x.exists?.thumb)} poster={String(x.exists?.poster)})
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Grid */}
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {/* Storage verify */}
                    <Card
                        title="Storage Verify"
                        desc="对 DB 路径与文件存在性做一致性检查，生成 JSON 报告（可选扫描孤儿文件）。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={() => setVerifyOpen(true)}>
                                <Wrench className="mr-2 h-4 w-4" />下载自检报告
                            </Button>
                            <Button variant="outline" className="rounded-full" onClick={async () => {
                                try {
                                    const r = await apiJson("/_maintenance/verify_storage?limit=2000&include_deleted=1&scan_files=0&max_files=5000");
                                    toast.success(`verify_storage: missing_media=${r.counts.missing_media} missing_thumb=${r.counts.missing_thumb}`);
                                } catch (e: any) {
                                    toast.error(e?.message || String(e));
                                }
                            }}>
                                快速扫描（2000）
                            </Button>
                        </div>
                    </Card>

                    {/* Missing files */}
                    <Card
                        title="Missing Files → Trash"
                        desc="扫描 media/thumb/poster 缺失的条目，先 dry-run 出报告，再确认批量移入回收站。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={() => setMissingOpen(true)}>
                                <ShieldAlert className="mr-2 h-4 w-4" />缺失文件扫描
                            </Button>
                            <Button variant="outline" className="rounded-full" onClick={async () => {
                                try {
                                    const r = await apiJson("/_maintenance/trash_missing_files", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({ limit: 5000, include_deleted: false, dry_run: true, reason: "quick_check" }),
                                    });
                                    toast.success(`missing_files(dry-run): ${r.missing_count}`);
                                } catch (e: any) {
                                    toast.error(e?.message || String(e));
                                }
                            }}>
                                快速 dry-run（5000）
                            </Button>
                        </div>
                    </Card>

                    {/* Orphans */}
                    <Card
                        title="Orphan Files"
                        desc="扫描 storage/media|thumb|poster 下的孤儿文件（DB 未引用），生成报告并在确认后删除。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={() => setOrphansOpen(true)}>
                                <Wrench className="mr-2 h-4 w-4" />孤儿文件清理
                            </Button>
                            <Button variant="outline" className="rounded-full" onClick={async () => {
                                try {
                                    const r = await apiJson("/_maintenance/orphans", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                            bucket: "all",
                                            include_deleted: true,
                                            max_scan_files: 20000,
                                            max_orphans: 2000,
                                            dry_run: true,
                                            confirm: "DRYRUN",
                                        }),
                                    });
                                    toast.success(`orphans(dry-run): total=${r.total_orphan_count} returned=${r.orphans_returned?.length || 0}`);
                                    if (r.report_url) window.open(fileUrl(r.report_url), "_blank");
                                } catch (e: any) {
                                    toast.error(e?.message || String(e));
                                }
                            }}>
                                快速 dry-run（打开报告）
                            </Button>
                        </div>
                    </Card>

                    {/* FTS */}
                    <Card
                        title="FTS Index"
                        desc="重建全文索引，解决搜索为空/不一致问题。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={async () => {
                                    try {
                                        const r = await apiJson("/_maintenance/fts_rebuild", { method: "POST" });
                                        toast.success(`FTS rebuilt: ${r.rebuilt}`);
                                        refreshDiag();
                                    } catch (e: any) {
                                        toast.error(e?.message || String(e));
                                    }
                                }}
                            >
                                重建 FTS
                            </Button>
                        </div>
                    </Card>

                    {/* Backfill SHA */}
                    <Card
                        title="Backfill media_sha256"
                        desc="为历史条目计算 media_sha256，导入去重/重复项浏览器依赖此字段。"
                    >
                        <div className="grid gap-2">
                            <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">limit</div>
                                    <Input type="number" value={shaLimit} onChange={(e) => setShaLimit(Number(e.target.value || 1))} />
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">include_deleted</div>
                                    <label className="mt-2 flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={shaIncludeDeleted} onChange={(e) => setShaIncludeDeleted(e.target.checked)} />
                                        include_deleted
                                    </label>
                                </div>
                            </div>

                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={async () => {
                                    try {
                                        const r = await apiJson("/_maintenance/backfill_media_sha256", {
                                            method: "POST",
                                            headers: { "content-type": "application/json" },
                                            body: JSON.stringify({ limit: shaLimit, include_deleted: shaIncludeDeleted }),
                                        });
                                        toast.success(`backfill sha: updated=${r.updated} missing_media=${r.missing_media}`);
                                        refreshDiag();
                                    } catch (e: any) {
                                        toast.error(e?.message || String(e));
                                    }
                                }}
                            >
                                执行回填
                            </Button>
                        </div>
                    </Card>

                    {/* Repair media */}
                    <Card
                        title="Repair Thumbs/Poster"
                        desc="重建缺失 thumb/poster（不改 DB 内容），用于修复破图/红块。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={async () => {
                                    try {
                                        const r = await apiJson("/_maintenance/repair_media", { method: "POST" });
                                        toast.success(`repair_media: thumb=${r.repaired.thumb} poster=${r.repaired.poster} missing_media=${r.missing_media}`);
                                        refreshDiag();
                                    } catch (e: any) {
                                        toast.error(e?.message || String(e));
                                    }
                                }}
                            >
                                执行修复（最近N）
                            </Button>
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                            如果需要更大范围，可把后端 endpoint 参数化（当前实现默认 limit=500）。
                        </div>
                    </Card>

                    {/* Mojibake repair */}
                    <Card
                        title="Repair Mojibake"
                        desc='修复历史乱码（先 DRYRUN 查看样本，再 confirm="FIX" 应用）。'
                    >
                        <div className="grid gap-2">
                            <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">limit</div>
                                    <Input type="number" value={mojiLimit} onChange={(e) => setMojiLimit(Number(e.target.value || 1))} />
                                </div>
                                <div>
                                    <div className="text-xs font-semibold text-gray-700">include_deleted</div>
                                    <label className="mt-2 flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={mojiIncludeDeleted} onChange={(e) => setMojiIncludeDeleted(e.target.checked)} />
                                        include_deleted
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    className="rounded-full"
                                    onClick={async () => {
                                        try {
                                            const r = await apiJson("/_maintenance/repair_mojibake", {
                                                method: "POST",
                                                headers: { "content-type": "application/json" },
                                                body: JSON.stringify({ confirm: "DRYRUN", limit: mojiLimit, include_deleted: mojiIncludeDeleted }),
                                            });
                                            toast.success(`dry-run changed=${r.changed} scanned=${r.scanned}`);
                                            console.log("mojibake sample:", r.sample);
                                        } catch (e: any) {
                                            toast.error(e?.message || String(e));
                                        }
                                    }}
                                >
                                    DRYRUN
                                </Button>

                                <Button
                                    className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                    onClick={async () => {
                                        try {
                                            const r = await apiJson("/_maintenance/repair_mojibake", {
                                                method: "POST",
                                                headers: { "content-type": "application/json" },
                                                body: JSON.stringify({ confirm: "FIX", limit: mojiLimit, include_deleted: mojiIncludeDeleted }),
                                            });
                                            toast.success(`FIX applied changed=${r.changed}`);
                                            refreshDiag();
                                        } catch (e: any) {
                                            toast.error(e?.message || String(e));
                                        }
                                    }}
                                >
                                    FIX（应用）
                                </Button>
                            </div>

                            <div className="text-xs text-gray-600">
                                建议先 DRYRUN 看 sample（控制台输出），确认无误再 FIX。
                            </div>
                        </div>
                    </Card>

                    {/* Batch Reclassify */}
                    <Card
                        title="Batch Reclassify"
                        desc="重新扫描条目的分类。基于当前已有条目建立分类原型（Centroids）并重新归类。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200" onClick={() => setReclassOpen(true)}>
                                自动分类重算
                            </Button>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                            支持 DRYRUN、阈值调整、仅重分“未分类”等安全策略。
                        </div>
                    </Card>

                    {/* Trash bin */}
                    <Card
                        title="Recycle Bin"
                        desc="查看回收站条目并执行恢复/永久删除操作。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={() => (window.location.href = "/?view=trash")}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />打开回收站
                            </Button>
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                            回收站视图可批量恢复、批量永久删除（需确认）。
                        </div>
                    </Card>

                    {/* Purge deleted */}
                    <Card
                        title="Purge Deleted"
                        desc="永久删除回收站条目（DB 行 + 版本/标签/向量），可选删除文件。不可恢复。"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button
                                className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                                onClick={() => setPurgeOpen(true)}
                            >
                                打开永久删除面板
                            </Button>
                            <Button
                                variant="outline"
                                className="rounded-full"
                                onClick={() => (window.location.href = "/duplicates")}
                            >
                                <ExternalLink className="mr-2 h-4 w-4" />重复项浏览器
                            </Button>
                        </div>
                    </Card>
                </div>

                {/* dialogs (reuse existing) */}
                <StorageVerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
                <MissingFilesDialog open={missingOpen} onOpenChange={setMissingOpen} onDone={() => refreshDiag()} />
                <OrphansDialog open={orphansOpen} onOpenChange={setOrphansOpen} />
                <PurgeDialog open={purgeOpen} onOpenChange={setPurgeOpen} onDone={() => refreshDiag()} />
                <ReclassifyDialog open={reclassOpen} onOpenChange={setReclassOpen} />
            </div>
        </div>
    );
}
