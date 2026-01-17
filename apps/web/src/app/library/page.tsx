"use client";

import { useState } from "react";
import { AssetsView } from "./components/AssetsView";
import { PeopleView } from "./components/PeopleView";
import { PersonView } from "./components/PersonView";
import { Settings, Images, Users } from "lucide-react";

export default function LibraryPage() {
    const [activeView, setActiveView] = useState<"assets" | "people" | "person">("assets");
    const [activePersonId, setActivePersonId] = useState<string | null>(null);

    const openPerson = (personId: string) => {
        setActivePersonId(personId);
        setActiveView("person");
    };

    const backToPeople = () => {
        setActiveView("people");
        setActivePersonId(null);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-7xl px-4 py-6">
                {/* 视图切换 */}
                <div className="flex items-center gap-2 mb-6">
                    <button
                        onClick={() => setActiveView("assets")}
                        className={[
                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm transition",
                            activeView === "assets"
                                ? "bg-yellow-200 text-yellow-950"
                                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200",
                        ].join(" ")}
                    >
                        <Images className="w-4 h-4" />
                        Assets
                    </button>
                    <button
                        onClick={() => setActiveView("people")}
                        className={[
                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm transition",
                            activeView === "people" || activeView === "person"
                                ? "bg-yellow-200 text-yellow-950"
                                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200",
                        ].join(" ")}
                    >
                        <Users className="w-4 h-4" />
                        People
                    </button>
                </div>

                {/* 内容区域 */}
                {activeView === "assets" && <AssetsView />}
                {activeView === "people" && <PeopleView onOpenPerson={openPerson} />}
                {activeView === "person" && activePersonId && (
                    <PersonView personId={activePersonId} onBack={backToPeople} />
                )}
            </div>
        </div>
    );
}
