import { mergeUIStateToSettings, settingsToUIState } from "src/ui/adapters/settingsAdapter";
import { DEFAULT_SETTINGS } from "src/settings";

describe("settings adapter", () => {
    it("does not expose Anki model names in the UI state", () => {
        const uiState = settingsToUIState(DEFAULT_SETTINGS);
        const rawUiState = uiState as unknown as Record<string, unknown>;

        expect("ankiSyncBasicModelName" in rawUiState).toBe(false);
        expect("ankiSyncClozeModelName" in rawUiState).toBe(false);
    });

    it("ignores Anki model name fields when merging UI changes back into settings", () => {
        const original = {
            ...DEFAULT_SETTINGS,
            ankiSyncModelName: "legacy-basic",
            ankiSyncBasicModelName: "legacy-basic",
            ankiSyncClozeModelName: "legacy-cloze",
        };

        const merged = mergeUIStateToSettings(original, {
            ankiSyncEnabled: true,
            ankiSyncBasicModelName: "ui-basic",
            ankiSyncClozeModelName: "ui-cloze",
        } as any);

        expect(merged.ankiSyncEnabled).toBe(true);
        expect(merged.ankiSyncModelName).toBe("legacy-basic");
        expect(merged.ankiSyncBasicModelName).toBe("legacy-basic");
        expect(merged.ankiSyncClozeModelName).toBe("legacy-cloze");
    });
});
