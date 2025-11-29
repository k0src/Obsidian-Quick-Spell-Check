import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import nspell from "nspell";
import {
	SelectSpellCheckSettings,
	DEFAULT_SETTINGS,
	SelectSpellCheckSettingTab,
} from "./src/settings";
import { SpellChecker } from "./src/spellChecker";
import { DictionaryManager } from "./src/dictionaryManager";

export default class SelectSpellCheckPlugin extends Plugin {
	settings: SelectSpellCheckSettings;
	spell: any = null;
	dictionaryManager: DictionaryManager;
	private spellChecker: SpellChecker;

	async onload() {
		await this.loadSettings();
		this.dictionaryManager = new DictionaryManager(this);

		const enDictionaryInstalled =
			await this.dictionaryManager.isDictionaryInstalled("en");
		if (!enDictionaryInstalled) {
			new Notice("Quick Spell Check: Downloading English dictionary...");
			await this.dictionaryManager.downloadDictionary("English", "en");
		}

		await this.loadDictionary();

		this.spellChecker = new SpellChecker(this);

		this.addSettingTab(new SelectSpellCheckSettingTab(this.app, this));

		this.addCommand({
			id: "accept-top-suggestion",
			name: "Accept top spelling suggestion",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			) => {
				if (checking) return true;
				this.spellChecker.acceptTopSuggestion(editor, view);
			},
		});

		this.addCommand({
			id: "open-spelling-menu",
			name: "Open spelling menu",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			) => {
				if (checking) return true;
				this.spellChecker.openSpellingMenu(editor, view);
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				this.spellChecker.resetCyclingState();
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadDictionary() {
		try {
			const { affPath, dicPath } =
				this.dictionaryManager.getDictionaryPath(
					this.settings.currentDictionary
				);
			const adapter = this.app.vault.adapter;

			if (
				!(await adapter.exists(affPath)) ||
				!(await adapter.exists(dicPath))
			) {
				new Notice(
					`Dictionary "${this.settings.currentDictionary}" not found.`
				);
				return;
			}

			const affData = await adapter.read(affPath);
			const dicData = await adapter.read(dicPath);

			this.spell = nspell(affData, dicData);

			if (this.settings.customDictionary) {
				const customWords = this.settings.customDictionary
					.split("\n")
					.map((word) => word.trim())
					.filter((word) => word.length > 0);

				customWords.forEach((word) => {
					this.spell.add(word);
				});
			}
		} catch (error) {
			console.error("Failed to load dictionary:", error);
		}
	}

	onunload() {
		this.spellChecker.cleanup();
	}
}
