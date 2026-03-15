/** @jsxImportSource react */
/**
 * [閻庡湱鎳撳▍鎶?濠㈣泛绉崇弧鍕濮樺磭妯堥柣銊ュ鐎靛瞼鈧湱鎳撳▍鎺楁晬瀹€鈧鎼佹偠?Card 闁?Deck 閻熸瑥妫楀ù姗€鎯冮崟顐㈢€奸柟骞垮灩婵晠鎮藉Ч鍥ｅ亾?
 * 鐟滅増鎸昏ぐ鍐╃鐠虹儤鍊甸柛娆愭緲閹挸顫㈤妷銉ф殮闁瑰瓨鍔栧鍌炴晬鐏炵晫鏆婂ù鍏间亢閸ゆ粓宕濋妸锕€澶嶉柡鈧捄铏圭暛闁圭虎鍘界粔鐑藉箒椤栨稒闄嶉悘鐐╁亾闂侇喓鍔岄崺娑㈠棘閹殿喖顤傜紓浣稿閻栧弶绋夋繝鍕暠闁轰焦婢橀悺褔鏁?
 * 闁兼澘濂旂粭澶嬪濮樿泛娅㈤柡鍌涙緲婵偞娼懞銉︽濞戞搩浜妴澶愭椤喚绀夐柟纰樺亾濞寸姰鍎抽弫銈夊箣閾氬倻鐟濆ù鍏兼皑濠€鍛村礆閺夎法娼屾鐐存礋濡垶鎮滄担纰樺亾?
 *
 * 閻庣懓鍟﹢顏呫亜閸︻厽绐楀☉鎿冨幖閻ɑ绂嶆惔顖滅獥闁伙絽鐭傚鎵沪?
 *
 * 閻庣懓鍟╃槐浼存偨閵娿儱鐓傞柛婵愪簷缁ㄦ椽寮崶锔筋偨闁?
 * 1. src/ui/context/ReviewContext.tsx 闁?濠㈣泛绉崇弧鍕▔婵犱胶鐟撻柡?
 * 2. src/ui/components/DeckTree.tsx 闁?闁绘鐬肩划宥夊冀閹寸姴笑闁告帗顨夐妴?
 * 3. src/ui/components/LinearCard.tsx 闁?闁告绱曟晶鏍ㄥ緞瀹ュ嫮鐦庣紓浣稿濞?
 * 4. src/ui/adapters/deckAdapter.ts 闁?闁轰胶澧楀畵浣规姜椤掍礁搴婄€规悶鍎遍崣?
 * 5. src/Events/SyncEvents.ts 闁?闁活潿鍔嶅鐢稿箳閵夛附鏆柛姘湰椤掔偟鈧懓鏈崹姘舵儍閸曨偆鐣柟缁㈠幗缁夌兘骞?
 *
 * 闁告繍浜欑花娲棘閸ワ附顐藉ù鍏兼皑閺併倝宕氶弶璺ㄦ殜闁?
 * 1. src/ui/ReactReviewApp.tsx 闁?濞达絾绮堢拹?React 閹煎瓨姊婚弫銈夋儍閸曨亜鐦滄繛鎾冲级閻撳绱掗崟顏咁偨
 */
/**
 * ReviewSession - 濠㈣泛绉崇弧鍕濮樺磭妯堝☉鎾诡嚙椤旀劙宕?
 *
 * 缂備胶鍠嶇粩瀵哥不閿涘嫭鍊?DeckTree 闁?CardReview 閻熸瑥妫楀ù?
 * 閻庡湱鍋熼獮?iOS 濡炲瀛╅悧鎼佹儍閸曨垬鈧妫冮姀锛勬嫧闁告柣鍔忕换鍐ㄣ€掗垾鍐残楅柣?
 */

import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer, Notice } from "obsidian";
import { t } from "src/lang/helpers";
import { ReviewContext } from "../context/ReviewContext";
import { DeckOptionsPanel } from "../components/DeckOptionsPanel";
import { DeckTree } from "../components/DeckTree";
import { LinearCard, CardState } from "../components/LinearCard";
import { deckToUIState, findDeckByPath, saveCollapseState } from "../adapters/deckAdapter";
import { DeckState } from "../types/deckTypes";
import type SRPlugin from "src/main";
import { IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { Deck, DeckTreeFilter, CardListType } from "src/Deck";
import { ReviewResponse, textInterval } from "src/scheduling";
import { CardType } from "src/Question";
import { TopicPath } from "src/TopicPath";
import { CardFrontBackUtil } from "src/question-type";

// ==========================================
// 缂侇偉顕ч悗椋庘偓瑙勭煯缁?
// ==========================================

/** 閻熸瑥妫楀ù妯肩尵鐠囪尙鈧?*/
type ViewType = "deck-list" | "review";

/** 缂備礁瀚▎?Props */
interface ReviewSessionProps {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    initialView?: ViewType;
    onClose?: () => void;
}

// ==========================================
// 闁告柣鍔庨弫楣冨矗濡湱绉奸悗瑙勭煯缁?(iOS 濡炲瀛╅悧?Slide)
// ==========================================

const slideVariants: any = {
    // 閺夆晜绋戦崣鍡涘籍閸撲焦鐣遍柛鎺撶箓椤劙鎮╅懜纰樺亾?
    enter: () => ({
        x: 0,
        opacity: 0,
        zIndex: 1,
        boxShadow: "none",
    }),
    // 閻忕偛鎳嶉懙鎴﹀及閸撗佷粵闁绘鍩栭埀?
    center: {
        x: 0,
        opacity: 1,
        zIndex: 1,
        boxShadow: "none",
        transition: { duration: 0.2, ease: "easeOut" },
    },
    // 闂侇偀鍋撻柛鎴犲劋濡炲倿鎯冮崟顓炐﹂柟?
    exit: () => ({
        x: 0,
        opacity: 0,
        zIndex: 0,
        boxShadow: "none",
        transition: { duration: 0.15, ease: "easeInOut" },
    }),
};

// 缂佸顕ф慨鈺冪博椤栨粎鏆嗛柛鏍ㄧ墪婵晠鎮界拠鎻掔秮濞?(闁诡儸鍡楀幋濞村吋锚鐎垫煡鏁嶅顒€娑ч柣顫妽鐠愪即宕楅妷锕佺獥闁告垹灏ㄧ槐婵嬪籍閻樺磭鎷ㄩ柛?
// TODO: Fix Framer motion typescript types - casting as any for now to bypass strict checks
const mobileSlideVariants: any = {
    enter: () => ({
        opacity: 0,
        zIndex: 1,
    }),
    center: {
        opacity: 1,
        zIndex: 1,
        transition: { duration: 0.15 },
    },
    exit: () => ({
        opacity: 0,
        zIndex: 0,
        transition: { duration: 0.1 },
    }),
};

// ==========================================
// 閺夊牆鎳庢慨顏堝礄閼恒儲娈?
// ==========================================

/**
 * [V3 闁稿繑濞婇弫顓熺┍椤旂⒈妲籡 闁硅泛锕▓褏绮嬬拠鍙夊€甸柣銊ュ閻℃瑩寮介幋锕€娅㈤柡鍌涙緲鐎垫﹢宕堕悙鎵伇濞戞搩浜滈悾顒勫极鐎靛憡鐣遍悹渚灠缁剁偟绱掗幘瀵糕偓顖涚▔椤撴壕鍋?
 * 閺夆晜鐟﹂悧閬嶅磻濮橆厽笑濞戞捁妗ㄧ花鈩冪┍濠靛洤鐦?TopicPath 闁汇劌瀚悾顒勫极鐎涙ǚ鍋撹缁辨繃鎷呴崹顔剧箒 sequencer 濞戞搩鍘惧▓?getDeck(path) 闁告粌鑻崹褰掑础閿熺姭鍋撻弰蹇曞竼闁煎疇濮ら婊呮暜缁嬪じ绱ｅù锝嗗殠閳?
 */
function wrapDeckWithRoot(fullPath: string, isolatedDeck: Deck): Deck {
    const root = new Deck("Root", null);
    if (!fullPath || fullPath === "root") {
        return isolatedDeck;
    }

    const parts = fullPath.split("/").filter(Boolean);
    let current = root;

    // 闁告帗绋戠紓鎾舵崉椤栨氨绐炲☉鎾筹功濞堟垶绋夐銏★紵闁煎搫鍊婚崑?
    for (let i = 0; i < parts.length - 1; i++) {
        const node = new Deck(parts[i], current);
        current.subdecks.push(node);
        current = node;
    }

    // 闁圭鍊藉ù鍥⒕閺冨偆鐎查柛姘捣濞堟垹鈧湱鍋ゅ顖炴偋瀹€鈧划?
    isolatedDeck.parent = current;
    current.subdecks.push(isolatedDeck);

    return root;
}

// ==========================================
// 濞戞捁宕电划宥嗙?
// ==========================================

export const ReviewSession: React.FC<ReviewSessionProps> = ({
    plugin,
    sequencer,
    initialView = "deck-list",
    onClose,
}) => {
    // --- 闁绘鍩栭埀?---
    const [view, setView] = useState<ViewType>(initialView);
    const [direction, setDirection] = useState(0); // 1 = Push, -1 = Pop
    const [tick, setTick] = useState(0); // 闁活潿鍔嬬花顒€顕ｉ崫鍕厬闁告帡鏀遍弻?
    const [recentDeckPath, setRecentDeckPath] = useState<string | null>(null);
    const deckListScrollTopRef = useRef(0);

    const logRuntimeDebug = useCallback(
        (...args: unknown[]) => {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.log(...args);
            }
        },
        [plugin],
    );

    const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

    // --- 閻犱降鍨藉Σ鍕触鐏炵虎鍔勫ù婊冾儎濞嗐垽鏁嶅顒佸€辨慨婵勫劚閻ｎ剟骞嬮幇顒佸€甸柤濂変簻婵晠宕氶柨瀣厐闁轰焦婢橀悺?---
    useEffect(() => {
        logRuntimeDebug("[SR-DynSync] ReviewSession: subscribed to sync-complete & deck-stats-updated");

        const onSyncComplete = () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: sync-complete received");
            forceUpdate();
        };

        const onStatsUpdated = () => {
            forceUpdate();
        };

        const unsubSync = plugin.syncEvents.on("sync-complete", onSyncComplete);
        const unsubStats = plugin.syncEvents.on("deck-stats-updated", onStatsUpdated);

        return () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: unsubscribed from sync events");
            unsubSync();
            unsubStats();
        };
    }, [plugin, forceUpdate, logRuntimeDebug]);

    useEffect(() => {
        logRuntimeDebug(`[SR-DynSync] ReviewSession: tick=${tick}`);
    }, [tick, logRuntimeDebug]);
    const contextValue = useMemo(
        () => ({
            app: plugin.app,
            plugin,
            settings: plugin.data.settings,
            sequencer,
        }),
        [plugin, sequencer],
    );

    // --- 濞戞挻鑹炬慨鐔兼焻閺勫繒甯?---

    /**
     * 濠㈣泛瀚幃濠囨偋瀹€鈧划宥夋倷閻熸澘姣?-> 閺夆晜绋戦崣鍡樺緞瀹ュ嫮鐦?
     */
    const handleDeckClick = useCallback(
        (deckState: DeckState) => {
            const latestRemainingTree = plugin.remainingDeckTree;
            const latestFullTree = plugin.deckTree;

            const fullPath = deckState.fullPath || deckState.deckName;
            // 1. 濞寸姴瀛╁褏鎮伴埀顒勫极閻楀牆绁︽繝褎鍔掗懙鎴﹀箥閹冪厒闁活潿鍔嶉崺娑㈡儑閻斿壊鍔€闁绘劗鎳撻崵顕€鎯冮崟顐㈡枾濠殿喖顑囨晶婵堢磼?
            const rawClickedDeck = findDeckByPath(latestRemainingTree, fullPath);

            if (rawClickedDeck) {
                // 2. [V3 闁哄秶顭堢缓楣冩⒕閺冨偆鐎查梺顐ｆ缁剁帡 閻忓繐妫滈姘舵偋瀹€鈧划宥嗘媴濠娾偓鐠愮喖宕楅妸锔界厐闁?Root 閺夆晜绋栭、鎴︽⒔閹伴偊鏉洪柟鎼簼閺屽洭鏁?
                const isolatedContextDeck = DeckTreeFilter.filterByDailyLimits(
                    rawClickedDeck,
                    plugin,
                );

                // 3. [V3 閻犱警鍨扮欢鐐寸┍椤旂⒈妲籡 閻忓繐妫濆▓褏绮嬬拠鍙夊€甸柣銊ュ婢ф繄绱掗崟顐㈢樁闁搞儳鍋樼粩瀛樼▔椤忓嫬寰旈柡鍫濐槸閻ｎ剟寮壕瀣唴鐎垫澘瀚▓?Root 閻庡湱鎳撳▍鎺撶▔?
                const wrappedDeckTree = wrapDeckWithRoot(fullPath, isolatedContextDeck);

                // 4. 閻忓繐妫滅换鏍ㄧ▔椤忓嫬鐦堕悷浣烘嚀閹鎯冮崟顖涱吘缂佸倻绮悥鍙夊閻樼數鑸?Sequencer
                sequencer.setDeckTree(latestFullTree, wrappedDeckTree, latestRemainingTree);
                sequencer.setCurrentDeck(TopicPath.emptyPath);

                logRuntimeDebug(`[V3-Scheduler] Clicked Deck: ${fullPath}, isolated new=${isolatedContextDeck.getCardCount(CardListType.NewCard, true)}, due=${isolatedContextDeck.getCardCount(CardListType.DueCard, true)}`);


                if (sequencer.hasCurrentCard) {
                    setRecentDeckPath(fullPath);
                    setDirection(1);
                    setView("review");
                } else {
                    new Notice(t("REVIEW_NO_CARDS"));
                }
            }
        },
        [sequencer, plugin, logRuntimeDebug],
    );

    /**
     * 闂侇偀鍋撻柛鎴濇惈椤﹀弶绋?-> 閺夆晜鏌ㄥú鏍礆濡ゅ嫨鈧?
     */
    const handleExitReview = useCallback(() => {
        plugin.setSRViewInFocus(false);
        setDirection(-1);
        setView("deck-list");
        plugin.savePluginData();
        forceUpdate(); // 闁告帡鏀遍弻濠囧礆濡ゅ嫨鈧啰绱掗悢娲诲悁
    }, [plugin, forceUpdate]);

    /**
     * 濠㈣泛瀚幃濠囧炊閻愮數鎽?
     */
    const handleAnswer = useCallback(
        async (rating: number) => {
            logRuntimeDebug(`[SR-DynSync] ReviewSession: handleAnswer rating=${rating}`);
            const responseMap = [
                ReviewResponse.Reset,
                ReviewResponse.Hard,
                ReviewResponse.Good,
                ReviewResponse.Easy,
            ];

            try {
                logRuntimeDebug("[SR-DynSync] ReviewSession: calling sequencer.processReview");
                await sequencer.processReview(responseMap[rating] ?? ReviewResponse.Good);
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer.processReview completed");
            } catch (e) {
                console.error("[SR] processReview 鐎殿喖鍊搁悥?", e);
            }

            if (sequencer.hasCurrentCard) {
                logRuntimeDebug("[SR-DynSync] ReviewSession: current card remains, forceUpdate");
                forceUpdate();
            } else {
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer exhausted, exiting review");
                handleExitReview();
            }
        },
        [sequencer, forceUpdate, handleExitReview, logRuntimeDebug],
    );


    const handleUndo = useCallback(async () => {
        if (!sequencer.canUndo) {
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }
        await sequencer.undoReview();
        forceUpdate();
    }, [sequencer, forceUpdate]);

    /**
     * 濠㈣泛瀚幃濠囧礆閻樼粯鐝?闁告瑦鐗楃粔椋庢崉閻斿鍤?
     */
    const handleDelete = useCallback(async () => {
        await sequencer.untrackCurrentCard();
        if (sequencer.hasCurrentCard) {
            forceUpdate();
        } else {
            handleExitReview();
        }
    }, [sequencer, forceUpdate, handleExitReview]);

    /**
     * 濠㈣泛瀚幃濠囧箮濡搫缍岄柣妯垮煐閳ь兛绀佽ぐ澶愬礌?
     */
    const handleCollapseChange = useCallback(
        async (fullPath: string, isCollapsed: boolean) => {
            await saveCollapseState(plugin, fullPath, isCollapsed);
        },
        [plugin],
    );

    // 婵☆偀鍋撴繛鏉戭儐濡叉悂宕ラ敂鑳缂佸顕ф慨鈺冪博?(isMobile 闁?Obsidian 閺夆晜鍔橀、鎴﹀籍鐠鸿櫣鎽犻柛锔荤厜缁辨繃鎷?TypeScript 缂侇偉顕ч悗椋庘偓瑙勭煯缁犵喐绋夐鐔烘⒕闁?
    const isMobile = (plugin.app as any).isMobile === true;

    // 闁哄秷顫夊畵浣烘媼閹屾У闂侇偄顦扮€氥劑宕濋妸褎鏆伴柛娆惷肩紞?
    const activeVariants = isMobile ? mobileSlideVariants : slideVariants;

    return (
        <ReviewContext.Provider value={contextValue}>
            <div
                className="sr-review-session"
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    background: "var(--background-primary)",
                }}
            >
                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                    {view === "deck-list" ? (
                        <motion.div
                            key="deck-list"
                            custom={direction}
                            variants={activeVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            style={{
                                position: "absolute",
                                width: "100%",
                                height: "100%",
                                background: "var(--background-primary)",
                                pointerEvents: "none",
                            }}
                        >
                            <DeckListView
                                sequencer={sequencer}
                                plugin={plugin}
                                onDeckClick={handleDeckClick}
                                onCollapseChange={handleCollapseChange}
                                tick={tick}
                                recentDeckPath={recentDeckPath}
                                initialScrollTop={deckListScrollTopRef.current}
                                onScrollTopChange={(scrollTop) => {
                                    deckListScrollTopRef.current = scrollTop;
                                }}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="review-card"
                            custom={direction}
                            variants={activeVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            style={{
                                position: "absolute",
                                width: "100%",
                                height: "100%",
                                background: "var(--background-primary)",
                                pointerEvents: "none",
                            }}
                        >
                            <CardReviewView
                                sequencer={sequencer}
                                plugin={plugin}
                                onAnswer={handleAnswer}
                                onUndo={handleUndo}
                                onDelete={handleDelete}
                                onExit={handleExitReview}
                                tick={tick}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ReviewContext.Provider>
    );
};

// ==========================================
// 閻庢稒鍔橀～瀣炊閹惧懐绐桪eck List
// ==========================================

interface DeckListViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    onDeckClick: (deckState: DeckState) => void;
    onCollapseChange: (fullPath: string, isCollapsed: boolean) => void;
    tick: number;
    recentDeckPath: string | null;
    initialScrollTop: number;
    onScrollTopChange: (scrollTop: number) => void;
}

interface OpenDeckOptionsState {
    deckName: string;
    deckPath: string;
}


const DeckListView: React.FC<DeckListViewProps> = ({
    sequencer,
    plugin,
    onDeckClick,
    onCollapseChange,
    tick,
    recentDeckPath,
    initialScrollTop,
    onScrollTopChange,
}) => {
    const panelHostRef = useRef<HTMLDivElement>(null);
    const treeHostRef = useRef<HTMLDivElement>(null);
    const treeShellRef = useRef<HTMLDivElement>(null);
    const [openDeckOptions, setOpenDeckOptions] = useState<OpenDeckOptionsState | null>(null);
    const [isSyncing, setIsSyncing] = useState(plugin.syncLock);
    const initialTreeWidth = Number((plugin.data.settings as any).reactDeckTreeWidth ?? 860);
    const [treeWidth, setTreeWidth] = useState(initialTreeWidth);

    useLayoutEffect(() => {
        const host = treeHostRef.current;
        if (!host) return;
        host.scrollTop = initialScrollTop;
    }, [initialScrollTop]);

    // [V3 閻犲鍟€规娊宕抽埡?婵炴挸寮堕悡瀣冀閹存繂鐏欓悶娑辩厜缁变即鎯勭€涙ê澶嶅ù锝堟硶閺併倝宕犻崨顓熷創闁圭鍋撻柡鍫濐槸瀹曢亶鎮ч崶鈺傜暠 remainingDeckTree闁?
    // deckToUIState 闁告垼濮ら弳鐔煎礃閸涙潙鍔ュù鍏间亢閸ゆ粓宕濋妸銉у畨闁?V3 缂佺姵顨嗙涵鍫曟嚊椤忓嫮淇洪柛姘灣缁楀倻鎷嬮敍鍕毈闁哄嫬澧介妵姘跺极閺夎法鎽熼柨?
    const decks = useMemo(() => {
        // 闁告绮敮鈧ù婊冩缁狅綁宕滃鍥ㄧ暠 DeckTreeFilter.filterByDailyLimits闁挎稑鐬煎ú鍧楀箳閵夈倖鍞夌紓浣圭懇閳ь剙鍊块崢銈夊闯閵娧冨毐闁轰焦婢橀鐔烘媼閿涘嫮鏆?
        const remainingDeckTree = plugin.remainingDeckTree;
        if (!remainingDeckTree?.subdecks) {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.warn("[V3-Scheduler] DeckListView: remainingDeckTree not ready");
            }
            return [];
        }

        const result = remainingDeckTree.subdecks.map((deck: Deck) => deckToUIState(deck, plugin));
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.log(`[V3-Scheduler] DeckListView render: tick=${tick}, decks=${result.length}`);
        }
        return result;
    }, [plugin.remainingDeckTree, plugin, tick]);

    useEffect(() => {
        const unsubStart = plugin.syncEvents.on("sync-start", () => setIsSyncing(true));
        const unsubFinished = plugin.syncEvents.on("sync-finished", () => setIsSyncing(false));

        return () => {
            unsubStart();
            unsubFinished();
        };
    }, [plugin]);

    const handleSync = useCallback(() => {
        if (plugin.syncLock) {
            return;
        }
        setIsSyncing(true);
        void plugin.requestSync({ trigger: "manual" }).catch(() => setIsSyncing(false));
    }, [plugin]);

    const handleDeckSettingsClick = useCallback((deck: DeckState, _anchorEl: HTMLElement) => {
        setOpenDeckOptions({
            deckName: deck.deckName,
            deckPath: deck.fullPath || deck.deckName,
        });
    }, []);

    const handleTreeScroll = useCallback(() => {
        const host = treeHostRef.current;
        if (!host) return;
        onScrollTopChange(host.scrollTop);
    }, [onScrollTopChange]);

    const handleTreeResizeStart = useCallback(
        (event: React.MouseEvent | React.TouchEvent, direction: "w" | "e") => {
            event.preventDefault();
            event.stopPropagation();

            const host = treeHostRef.current;
            const shell = treeShellRef.current;
            if (!host || !shell) return;

            const isTouchEvent = "touches" in event;
            const startX = isTouchEvent ? event.touches[0].clientX : event.clientX;
            const startWidth = shell.offsetWidth || treeWidth;
            const minWidth = 320;
            const hostStyles = window.getComputedStyle(host);
            const hostPadding =
                parseFloat(hostStyles.paddingLeft || "0") + parseFloat(hostStyles.paddingRight || "0");
            const maxWidth = Math.max(minWidth, host.clientWidth - hostPadding);

            let currentWidth = startWidth;
            shell.classList.add("sr-deck-tree-shell--resizing");

            const applyTreeRect = () => {
                shell.style.width = `min(100%, ${currentWidth}px)`;
            };

            const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
                if ("preventDefault" in moveEvent) moveEvent.preventDefault();
                const clientX =
                    "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
                const deltaX = clientX - startX;

                const signedDelta = direction === "w" ? -deltaX : deltaX;
                const nextWidth = startWidth + signedDelta * 2;
                currentWidth = Math.max(minWidth, Math.min(nextWidth, maxWidth));
                applyTreeRect();
            };

            const handleEnd = () => {
                document.removeEventListener("mousemove", handleMove);
                document.removeEventListener("mouseup", handleEnd);
                document.removeEventListener("touchmove", handleMove);
                document.removeEventListener("touchend", handleEnd);
                shell.classList.remove("sr-deck-tree-shell--resizing");
                setTreeWidth(currentWidth);
                (plugin.data.settings as any).reactDeckTreeWidth = currentWidth;
                plugin.savePluginData();
            };

            document.addEventListener("mousemove", handleMove);
            document.addEventListener("mouseup", handleEnd);
            document.addEventListener("touchmove", handleMove, { passive: false });
            document.addEventListener("touchend", handleEnd);
        },
        [plugin, treeWidth],
    );

    return (
        <div
            className="sr-deck-list-view"
            ref={panelHostRef}
            style={{
                height: "100%",
                position: "relative",
                overflow: "hidden",
                pointerEvents: "auto",
            }}
        >
            <div className="sr-deck-list-scroll" ref={treeHostRef} onScroll={handleTreeScroll}>
                <div
                    className="sr-deck-tree-shell"
                    ref={treeShellRef}
                    style={{ width: `min(100%, ${treeWidth}px)` }}
                >
                    <div
                        className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--left"
                        onMouseDown={(e) => handleTreeResizeStart(e, "w")}
                        onTouchStart={(e) => handleTreeResizeStart(e, "w")}
                    />
                    <DeckTree
                        decks={decks}
                        onDeckClick={onDeckClick}
                        onSettingsClick={handleDeckSettingsClick}
                        onCollapseChange={onCollapseChange}
                        onSync={handleSync}
                        isSyncing={isSyncing}
                        recentDeckPath={recentDeckPath}
                    />
                    <div
                        className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--right"
                        onMouseDown={(e) => handleTreeResizeStart(e, "e")}
                        onTouchStart={(e) => handleTreeResizeStart(e, "e")}
                    />
                </div>
            </div>
            {openDeckOptions && (
                <DeckOptionsPanel
                    plugin={plugin}
                    deckName={openDeckOptions.deckName}
                    deckPath={openDeckOptions.deckPath}
                    containerElement={panelHostRef.current}
                    preferredWidth={Math.min(treeWidth, 760)}
                    onClose={() => setOpenDeckOptions(null)}
                    onSaved={() => {
                        if (plugin.data.settings.showRuntimeDebugMessages) {
                            console.log("[ReviewSession] DeckOptions saved");
                        }
                    }}
                />
            )}
        </div>
    );
};

// ==========================================
// ?????????Card Review
// ==========================================

interface CardReviewViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    onAnswer: (rating: number) => void;
    onUndo: () => void;
    onDelete: () => void;
    onExit: () => void;
    tick: number;
}

const CardReviewView: React.FC<CardReviewViewProps> = ({
    sequencer,
    plugin,
    onAnswer,
    onUndo,
    onDelete,
    onExit,
    tick,
}) => {
    const card = sequencer.currentCard;
    const question = sequencer.currentQuestion;
    const deck = sequencer.currentDeck;

    // 濠碘€冲€归悘澶娾柦閳╁啯绠掗柛妤嬬磿婢ф牠鏁嶅畝鍐闁搞儳鍋熼埞?
    if (!card || !question || !deck) {
        return null;
    }

    // 闁告垵妫楅ˇ顒勫础閿涘嫬顣婚柣妯垮煐閳?
    const settings = plugin.data.settings;

    // 闁告柣鍔嶉埀顑挎祰椤撳摜绮诲Δ浣烘Ж濞戞搩浜濈€垫粓鏌﹂鐐暠濠㈣泛绉崇弧鍕籍閸洘锛熼梻鍌涙尦濞?
    const intervals = [
        sequencer.determineCardSchedule(ReviewResponse.Reset, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Hard, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Good, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Easy, card).interval,
    ];

    // 闁哄秶鍘х槐锟犲礌閺嶏箒绀嬮柟绋款樀閹告娊寮介崶鈺婂姰 (濞撴艾顑呴々? "1m", "10m", "3d", "7d")
    const btnLabels = intervals.map((interval) => textInterval(interval, false));

    // 闁哄秷顫夊畵渚€宕￠敍鍕暬缂佷究鍨圭槐鈺呭礉閵婏腹鍋撴担鐑樻櫢闁瑰瓨鍔曢崬瀵糕偓?(闁衡偓椤栨稑鐦柟纰樺亾闁哄牆顦畷閬嶆偋閸モ晞顫﹂柛?
    const sourceText =
        question.questionText?.actualQuestion || question.parsedQuestionInfo?.text || "";
    const expanded = CardFrontBackUtil.expand(
        question.questionType,
        sourceText,
        settings,
        question.lineNo,
        {
            noteText: question.note?.reviewFileText || question.note?.fileText,
            firstLineNum: question.parsedQuestionInfo?.firstLineNum,
            lastLineNum: question.parsedQuestionInfo?.lastLineNum,
        },
    );
    const cardIdx = card.cardIdx;
    let front = expanded[cardIdx]?.front || "";
    let back = expanded[cardIdx]?.back || "";

    const cardState: CardState = {
        front,
        back,
        responseButtonLabels: btnLabels,
    };

    // 闁兼儳鍢茶ぐ鍥╃磼閻旀椿鍚€闁轰胶澧楀畵?
    const topicPath = deck.getTopicPath();
    const stats = sequencer.getDeckStats(topicPath);
    if (settings.showRuntimeDebugMessages) {
        console.log(
            `[DEBUG_REVIEW_UI] Card Review UI counters for deck '${deck.deckName}' -> New: ${stats.newCount}, Learning: ${stats.learningCount}, Due: ${stats.dueCount}`,
        );
    }
    let cardType: "new" | "learning" | "due" = "due";
    if (sequencer.isCurrentCardFromLearningQueue) {
        cardType = "learning";
    } else {
        const item = plugin.store?.getItembyID(card.Id);
        if (item?.isInLearningPhase) {
            cardType = "learning";
        } else if (card.isNew) {
            cardType = "new";
        }
    }

    // 闂傚牄鍨圭€垫浠?
    const breadcrumbs: string[] = question.questionContext || [];
    const filename = question.note?.file?.basename || "Unknown";

    // 闁煎浜滄慨鈺傛交濞戙垺鈻夐柡鍐ㄧ埣濡?
    const deckPath = deck.getTopicPath().path.join("/") || deck.deckName;
    const presetIndex = settings.deckPresetAssignment[deckPath] ?? 0;
    const preset = settings.deckOptionsPresets[presetIndex] || settings.deckOptionsPresets[0];
    const autoAdvanceSeconds = preset?.autoAdvance ? preset.autoAdvanceSeconds || 10 : 0;

    // 閻犲鍟抽惁顖涚┍閳╁啩绱?
    const getDebugInfo = () => {
        const item = plugin.store?.getItembyID(card.Id);
        if (!item) return null;
        return {
            basic: {
                ID: card.Id,
                fileID: item.fileID,
                itemType: "card",
                deckName: deck.deckName,
                timesReviewed: item.timesReviewed || 0,
                timesCorrect: item.timesCorrect || 0,
                errorStreak: item.errorStreak || 0,
                priority: item.priority || 0,
            },
            data: item.data || {},
            trace: card.debugTrace || [],
        };
    };

    // 濠㈣泛瀚幃濠囧箥閹惧磭纾荤紒妤佹椤斿洭鏁嶉崼婵堟毎濞达絽绉撮崺宀勫础閿涘嫬顣婚悶娑樿嫰瑜板潡鏁嶇仦鍊熷珯闁活収鍘藉▓蹇旑殗濡懓鐦ㄩ柨?
    const handleOpenNote = async () => {
        const noteFile = question.note?.file;
        if (!noteFile) return;

        const activeLeaf = plugin.app.workspace.getLeaf("tab");
        await activeLeaf.openFile((noteFile as any).file || noteFile);

        // 缂佹稑顦欢鐔虹磽閺嶎剛甯嗛柛锝冨妽鐟曞棝寮婚幘宕囨殮闁?
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 閻庤鐭紞鍛村礆閺夊灝骞㈤柣妤€娲╅、鎴﹀矗瀹勬媽瀚欓柣顓у幗濞堝繑顨囧Ο鐟扮槰
        if ((activeLeaf.view as any)?.editor) {
            const editor = (activeLeaf.view as any).editor;
            const lineNo = question.lineNo;

            // 闁兼儳鍢茶ぐ鍥╂嫚閵夘煈鏀介柣銊ュ閸炲鈧懓缍婇弳杈ㄦ償?
            const lineContent = editor.getLine(lineNo) || "";
            const from = { line: lineNo, ch: 0 };
            const to = { line: lineNo, ch: lineContent.length };

            // 閻犱礁澧介悿鍡涘礂婢跺鍨?
            editor.setCursor(from);

            // 濞达綀娉曢弫?CodeMirror 6 闁?scrollIntoView 妤犵偞鍎奸鏇犵磾?margin 濞达綀鍎婚、鎴犱沪閸涱剝鍘?
            const cm = editor.cm;
            if (cm && cm.scrollDOM) {
                // 闁兼儳鍢茶ぐ鍥╃磽閺嶎剛甯嗛柛锝冨妼瑜拌尙鎲撮崱娑氬蒋閹艰揪濡囧▓?40% 濞达絾绮堢拹?margin闁挎稑濂旀繛鍥儎椤旂晫鍨奸悶娑樻湰鐢瓨娼婚幋婊嗗幀闊?
                const viewHeight = cm.scrollDOM.clientHeight;
                const margin = Math.floor(viewHeight * 0.4);
                editor.scrollIntoView({ from, to }, margin);
            } else {
                // 闁搞儳鍋ら埀顑藉亾闁哄倽顫夐、?
                editor.scrollIntoView({ from, to }, true);
            }

            // 闁活収鍘藉▓蹇涙焻婢跺鍘悹鍥ュ劥椤㈡垶鎷呭鈧拹鐔割殗濡懓鐦ㄩ柡浣哥墛閻?
            editor.setSelection(from, to);

            // 1.5缂佸甯掗幃妤呭矗閺嶃劎啸闂侇偄顦懙?
            setTimeout(() => {
                editor.setCursor(from);
            }, 1500);
        }
    };

    // 濠㈣泛瀚幃濠囧箳閵娿劎绠?
    const handlePostpone = () => {
        new Notice(t("REVIEW_POSTPONED"));
        onAnswer(0);
    };

    // 濠㈣泛瀚幃濠勪焊閸濆嫷鍤熼悹瀣暞閺?
    const handleResize = (width: number, height: number) => {
        settings.reactFlashcardWidth = width;
        settings.reactFlashcardHeight = height;
        plugin.savePluginData();
    };

    return (
        <div
            className="sr-card-review-view"
            style={{
                height: "100%",
                display: "flex",
                justifyContent: "center",
                pointerEvents: "auto",
                alignItems: "center" /* 缂佸顕ф慨鈺冪博椤栨艾寮块悘鐐茬箲濡炲倻浠﹂崨顒冨幀閻庨潧缍婄紞?*/,
            }}
        >
            <LinearCard
                card={cardState}
                stats={{
                    new: stats.newCount,
                    learning: stats.learningCount,
                    due: stats.dueCount,
                }}
                cardType={cardType}
                type={
                    question.questionType === CardType.Cloze ||
                    question.questionType === CardType.AnkiCloze
                        ? "cloze"
                        : "basic"
                }
                filename={filename}
                breadcrumbs={breadcrumbs}
                autoAdvanceSeconds={autoAdvanceSeconds}
                onAnswer={onAnswer}
                onShowAnswer={() => {}}
                onUndo={onUndo}
                onOpenNote={handleOpenNote}
                onEditCard={() => {}}
                onPostpone={handlePostpone}
                onDelete={onDelete}
                onExit={onExit}
                onResize={handleResize}
                renderMarkdown={(text, el) => {
                    const sourcePath = question.note?.file?.path || "";
                    return MarkdownRenderer.render(plugin.app, text, el, sourcePath, plugin);
                }}
                width={settings.reactFlashcardWidth}
                height={settings.reactFlashcardHeight}
                debugInfo={getDebugInfo()}
                isMobile={(plugin.app as any).isMobile === true}
                plugin={plugin}
                rawContent={question.questionText?.actualQuestion || ""}
                onUpdateContent={async (text) => {
                    await sequencer.updateCurrentQuestionText(text);
                }}
            />
        </div>
    );
};
