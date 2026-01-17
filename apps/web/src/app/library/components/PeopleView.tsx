"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listPeople, type Person } from "@/lib/libraryApi";

const ANGLE_BUCKETS = [
    { key: "frontal", label: "Frontal" },
    { key: "l3q", label: "Left 3/4" },
    { key: "r3q", label: "Right 3/4" },
    { key: "lprofile", label: "Left Profile" },
    { key: "rprofile", label: "Right Profile" },
    { key: "up", label: "Up" },
    { key: "down", label: "Down" },
];

function hashColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const a = 30 + (h % 60);
    const b = 30 + ((h >>> 8) % 60);
    const c = 30 + ((h >>> 16) % 60);
    return `hsl(${a}, ${b}%, ${c}%)`;
}

function PhotoStub({ seed }: { seed: string }) {
    const bg = hashColor(seed);
    return (
        <div
            className="w-full h-full overflow-hidden ring-1 ring-black/5"
            style={{ background: `linear-gradient(135deg, ${bg}, rgba(0,0,0,0))` }}
        >
            <div className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.65),transparent_55%)]" />
        </div>
    );
}

function MiniBar({ value }: { value: number }) {
    const pct = Math.round(Math.max(0, Math.min(100, value * 100)));
    return (
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-foreground/80" style={{ width: `${pct}%` }} />
        </div>
    );
}

function CoverageDots({ coverage }: { coverage: Record<string, boolean> }) {
    return (
        <div className="flex flex-wrap gap-1">
            {ANGLE_BUCKETS.map((b) => (
                <span
                    key={b.key}
                    className={`inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 ${coverage[b.key] ? "bg-foreground/80" : "bg-muted"
                        }`}
                    title={`${b.label}: ${coverage[b.key] ? "OK" : "Missing"}`}
                />
            ))}
        </div>
    );
}

export function PeopleView({ onOpenPerson }: { onOpenPerson: (id: string) => void }) {
    const [query, setQuery] = useState("");
    const [people, setPeople] = useState<Person[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);

    const loadPeople = async () => {
        setLoading(true);
        try {
            const data = await listPeople({
                q: query || undefined,
                page: 1,
                page_size: 50,
            });
            setPeople(data.items);
            setTotal(data.total);
        } catch (error: any) {
            toast.error(error.message || "Failed to load people");
            setPeople([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPeople();
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            loadPeople();
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const toggleSelected = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    return (
        <div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索人物、标签…"
                        className="pl-9 rounded-full h-11"
                    />
                </div>
            </div>

            <div className="text-sm text-gray-600 mb-4">
                {loading ? "加载中..." : `共 ${total} 个人物 • 已选 ${selectedIds.size} 个`}
            </div>

            {/* People grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {people.map((person) => {
                    const selected = selectedIds.has(person.id);
                    const confidenceLabel =
                        person.confidence >= 0.9 ? "High" : person.confidence >= 0.8 ? "Medium" : "Low";
                    const confidenceVariant =
                        person.confidence >= 0.9 ? "default" : person.confidence >= 0.8 ? "secondary" : "destructive";

                    return (
                        <Card
                            key={person.id}
                            className={`rounded-3xl ring-1 cursor-pointer ${selected ? "ring-yellow-400/30" : "ring-black/5"
                                } hover:ring-yellow-400/30 transition`}
                            onClick={() => onOpenPerson(person.id)}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-2xl shadow-sm ring-1 ring-black/10 overflow-hidden w-14 h-14">
                                            <PhotoStub seed={person.id} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{person.name}</div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {person.faces_count} faces • {person.assets_count} assets
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant={person.status === "Verified" ? "default" : "secondary"}
                                            className="rounded-xl text-xs"
                                        >
                                            {person.status === "Verified" ? "已验证" : "待审核"}
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-gray-500">置信度</div>
                                            <Badge variant={confidenceVariant} className="rounded-xl text-xs">
                                                {confidenceLabel}
                                            </Badge>
                                        </div>
                                        <MiniBar value={person.confidence} />
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>角度覆盖</span>
                                            <span>
                                                {Object.values(person.coverage || {}).filter(Boolean).length}/{ANGLE_BUCKETS.length}
                                            </span>
                                        </div>
                                        <CoverageDots coverage={person.coverage || {}} />
                                    </div>
                                    <div className="pl-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSelected(person.id);
                                            }}
                                            className={`w-9 h-9 rounded-2xl ring-1 grid place-items-center transition ${selected
                                                    ? "bg-foreground text-background ring-black/10"
                                                    : "bg-muted/40 hover:bg-muted ring-black/5"
                                                }`}
                                            title={selected ? "已选" : "选择"}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                {person.tags?.length ? (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {person.tags.map((t) => (
                                            <Badge key={t} variant="secondary" className="rounded-xl text-xs">
                                                {t}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
