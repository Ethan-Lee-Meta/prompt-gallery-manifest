"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, FolderOpen, Copy, CheckCircle2, XCircle, Pin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    getPerson,
    pingLocalAgent,
    getRefsFolder,
    openRefsFolder,
    pinFace,
    excludeFace,
    setPersonRef,
    type Face,
} from "@/lib/libraryApi";

const ANGLE_BUCKETS = [
    { key: "frontal", label: "Frontal", row: 1, col: 1 },
    { key: "l3q", label: "Left 3/4", row: 1, col: 0 },
    { key: "r3q", label: "Right 3/4", row: 1, col: 2 },
    { key: "lprofile", label: "Left Profile", row: 2, col: 0 },
    { key: "rprofile", label: "Right Profile", row: 2, col: 2 },
    { key: "up", label: "Up", row: 0, col: 1 },
    { key: "down", label: "Down", row: 2, col: 1 },
];

function hashColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const a = 30 + (h % 60);
    const b = 30 + ((h >>> 8) % 60);
    const c = 30 + ((h >>> 16) % 60);
    return `hsl(${a}, ${b}%, ${c}%)`;
}

function PhotoStub({ seed, label }: { seed: string; label?: string }) {
    const bg = hashColor(seed);
    return (
        <div
            className="relative overflow-hidden ring-1 ring-black/5 bg-muted/20 w-full h-full"
            style={{ background: `linear-gradient(135deg, ${bg}, rgba(0,0,0,0))` }}
        >
            <div className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.65),transparent_55%)]" />
            {label && (
                <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-xl bg-background/70 ring-1 ring-black/5">
                    {label}
                </div>
            )}
        </div>
    );
}

export function PersonView({ personId, onBack }: { personId: string; onBack: () => void }) {
    const [faces, setFaces] = useState<Face[]>([]);
    const [refs, setRefs] = useState<Record<string, string>>({});
    const [coverage, setCoverage] = useState<Record<string, boolean>>({});
    const [personName, setPersonName] = useState("");
    const [activeBucket, setActiveBucket] = useState("frontal");
    const [agentStatus, setAgentStatus] = useState<"unknown" | "online" | "offline">("unknown");
    const [loading, setLoading] = useState(false);

    const loadPerson = async () => {
        setLoading(true);
        try {
            const data = await getPerson(personId);
            setPersonName(data.name);
            setFaces(data.faces || []);
            setRefs(data.refs || {});
            setCoverage(data.coverage || {});
        } catch (error: any) {
            toast.error(error.message || "Failed to load person");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPerson();

        // Check agent status
        pingLocalAgent()
            .then(() => setAgentStatus("online"))
            .catch(() => setAgentStatus("offline"));
    }, [personId]);

    const bucketFaces = faces.filter((f) => f.bucket === activeBucket && !f.excluded);

    const handleOpenFolder = async () => {
        if (agentStatus === "offline") {
            const fallbackPath = `./library/people/${personId}/refs`;
            await navigator.clipboard.writeText(fallbackPath);
            toast.info(`Agent 离线。已复制路径: ${fallbackPath}`);
            return;
        }

        try {
            await openRefsFolder(personId, true, true);
            toast.success("已打开文件夹");
        } catch (e: any) {
            toast.error(e?.message || "打开失败");
        }
    };

    const handleCopyPath = async () => {
        try {
            if (agentStatus === "online") {
                const data = await getRefsFolder(personId);
                await navigator.clipboard.writeText(data.path);
                toast.success(`已复制路径: ${data.path}`);
            } else {
                const fallbackPath = `./library/people/${personId}/refs`;
                await navigator.clipboard.writeText(fallbackPath);
                toast.success(`已复制路径: ${fallbackPath}`);
            }
        } catch (e: any) {
            toast.error(e?.message || "获取路径失败");
        }
    };

    const handleTogglePin = async (faceId: string, currentPinState: boolean) => {
        try {
            await pinFace(faceId, !currentPinState);
            toast.success(currentPinState ? "已取消 Pin" : "已 Pin");
            loadPerson(); // Reload
        } catch (e: any) {
            toast.error(e?.message || "操作失败");
        }
    };

    const handleToggleExclude = async (faceId: string, currentExcludeState: boolean) => {
        try {
            await excludeFace(faceId, !currentExcludeState);
            toast.success(currentExcludeState ? "已恢复" : "已排除");
            loadPerson(); // Reload
        } catch (e: any) {
            toast.error(e?.message || "操作失败");
        }
    };

    const handleSetRef = async (bucket: string, faceId: string) => {
        try {
            await setPersonRef(personId, bucket, faceId);
            toast.success("已设置为代表图");
            loadPerson(); // Reload
        } catch (e: any) {
            toast.error(e?.message || "设置失败");
        }
    };

    const cell: (typeof ANGLE_BUCKETS[number] | null)[] = Array.from({ length: 9 }, () => null);
    for (const item of ANGLE_BUCKETS) cell[item.row * 3 + item.col] = item;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-full" onClick={onBack}>
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        返回
                    </Button>
                    <div>
                        <div className="text-lg font-semibold">{personName || personId}</div>
                        <div className="text-sm text-gray-500">
                            {faces.length} 张脸 • Agent: {agentStatus}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-full" onClick={handleCopyPath}>
                        <Copy className="w-4 h-4 mr-2" />
                        复制路径
                    </Button>
                    <Button
                        className="rounded-full bg-yellow-300 text-yellow-950 hover:bg-yellow-200"
                        onClick={handleOpenFolder}
                    >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        打开文件夹
                    </Button>
                </div>
            </div>

            {/* Angle Matrix */}
            <div className="rounded-3xl ring-1 ring-black/5 bg-gray-50 p-4 mb-6">
                <div className="text-sm font-medium mb-3">角度覆盖（Angle Coverage）</div>
                <div className="grid grid-cols-3 gap-3">
                    {cell.map((b, idx) => {
                        if (!b) return <div key={idx} className="h-20 rounded-2xl bg-muted/30 ring-1 ring-black/5" />;
                        const has = !!refs[b.key];
                        const isActive = activeBucket === b.key;
                        return (
                            <button
                                key={b.key}
                                onClick={() => setActiveBucket(b.key)}
                                className={`h-20 rounded-2xl ring-1 text-left p-3 transition relative overflow-hidden ${isActive ? "ring-yellow-400/30 bg-white" : "ring-black/5 bg-white/60 hover:bg-white"
                                    }`}
                                title={b.label}
                            >
                                <div className="text-xs text-gray-500">{b.label}</div>
                                <div className="mt-2 flex items-center justify-between">
                                    <div className={`text-sm font-medium ${has ? "" : "text-gray-400"}`}>
                                        {has ? "Selected" : "Missing"}
                                    </div>
                                    {has ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                                </div>
                                {has && <div className="absolute -right-10 -bottom-10 w-24 h-24 rounded-full bg-foreground/5" />}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    点击角度查看候选图片
                </div>
            </div>

            {/* Bucket Faces */}
            <div className="text-sm font-medium mb-3">
                {activeBucket} 候选图片 ({bucketFaces.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {bucketFaces.map((face) => {
                    const selected = refs[activeBucket] === face.id;
                    return (
                        <div
                            key={face.id}
                            className={`group rounded-2xl ring-1 overflow-hidden text-left transition ${selected ? "ring-yellow-400/30" : "ring-black/5 hover:ring-yellow-400/20"
                                }`}
                        >
                            <div className="aspect-square cursor-pointer" onClick={() => handleSetRef(activeBucket, face.id)}>
                                <PhotoStub seed={face.id} />
                            </div>
                            <div className="p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-medium truncate">{face.bucket}</div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleTogglePin(face.id, face.pinned)}
                                            className={`p-1 rounded ${face.pinned ? "bg-yellow-200" : "hover:bg-gray-100"}`}
                                            title={face.pinned ? "Unpin" : "Pin"}
                                        >
                                            <Pin className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleToggleExclude(face.id, face.excluded)}
                                            className={`p-1 rounded ${face.excluded ? "bg-red-200" : "hover:bg-gray-100"}`}
                                            title={face.excluded ? "Include" : "Exclude"}
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate">
                                    q={Math.round((face.quality || 0) * 100)} • yaw {face.yaw || 0}° • pitch {face.pitch || 0}°
                                </div>
                                <div className="mt-1 flex gap-1">
                                    {face.excluded && (
                                        <Badge variant="destructive" className="rounded-xl text-[10px] px-2 py-0">
                                            Excluded
                                        </Badge>
                                    )}
                                    {selected && (
                                        <Badge className="rounded-xl text-[10px] px-2 py-0 bg-yellow-200 text-yellow-950">
                                            Selected
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {loading && <div className="text-center text-gray-500 py-4">加载中...</div>}
        </div>
    );
}
