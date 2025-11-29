import {
	Editor,
	EditorPosition,
	Plugin,
	Notice,
	MarkdownView,
	Menu,
	PluginSettingTab,
	App,
	Setting,
} from "obsidian";
import nspell from "nspell";

interface MisspelledWord {
	word: string;
	from: EditorPosition;
	to: EditorPosition;
}

interface SelectSpellCheckSettings {
	customDictionary: string;
}

const DEFAULT_SETTINGS: SelectSpellCheckSettings = {
	customDictionary: "",
};

export default class SelectSpellCheckPlugin extends Plugin {
	settings: SelectSpellCheckSettings;
	private spell: any = null;
	private currentLineMisspelledWords: MisspelledWord[] = [];
	private currentMisspelledIndex: number = -1;
	private lastLineChecked: number = -1;
	private currentMenu: Menu | null = null;
	private cycleResetTimeout: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();
		await this.loadDictionary();

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
				this.acceptTopSuggestion(editor, view);
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
				this.openSpellingMenu(editor, view);
			},
		});

		this.registerEditorChangeHandler();
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
			const adapter = this.app.vault.adapter;
			const pluginDir = this.manifest.dir + "/";

			const affPath = pluginDir + "index.aff";
			const dicPath = pluginDir + "index.dic";

			if (
				!(await adapter.exists(affPath)) ||
				!(await adapter.exists(dicPath))
			) {
				new Notice(
					"Dictionary files not found. Please add index.aff and index.dic to the plugin folder."
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

	registerEditorChangeHandler() {
		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				this.resetCyclingState();
			})
		);
	}

	resetCyclingState() {
		this.currentLineMisspelledWords = [];
		this.currentMisspelledIndex = -1;
		this.lastLineChecked = -1;
		if (this.cycleResetTimeout) {
			clearTimeout(this.cycleResetTimeout);
			this.cycleResetTimeout = null;
		}
	}

	acceptTopSuggestion(editor: Editor, view: MarkdownView) {
		if (!this.spell) {
			console.error("Spell checker not initialized");
			return;
		}

		const cursor = editor.getCursor();
		const currentLine = cursor.line;
		const lineText = editor.getLine(currentLine);

		const misspelledWords = this.findMisspelledWordsInLine(
			lineText,
			currentLine
		);

		if (misspelledWords.length === 0) {
			return;
		}

		const closestWord = this.findClosestWord(misspelledWords, cursor);

		if (!closestWord) {
			return;
		}

		const suggestions = this.getSpellingSuggestions(closestWord.word);

		if (suggestions.length === 0) {
			return;
		}

		const savedCursor = editor.getCursor();
		editor.replaceRange(suggestions[0], closestWord.from, closestWord.to);

		if (
			savedCursor.line === closestWord.from.line &&
			savedCursor.ch > closestWord.from.ch
		) {
			const lengthDiff = suggestions[0].length - closestWord.word.length;
			editor.setCursor({
				line: savedCursor.line,
				ch: savedCursor.ch + lengthDiff,
			});
		} else {
			editor.setCursor(savedCursor);
		}
	}

	openSpellingMenu(editor: Editor, view: MarkdownView) {
		if (!this.spell) {
			console.error("Spell checker not initialized");
			return;
		}

		const cursor = editor.getCursor();
		const currentLine = cursor.line;

		if (this.lastLineChecked !== currentLine) {
			this.resetCyclingState();
			const lineText = editor.getLine(currentLine);
			this.currentLineMisspelledWords = this.findMisspelledWordsInLine(
				lineText,
				currentLine
			);
			this.lastLineChecked = currentLine;
			this.currentMisspelledIndex = -1;
		}

		if (this.currentLineMisspelledWords.length === 0) {
			this.resetCyclingState();
			return;
		}

		if (this.currentMisspelledIndex === -1) {
			const closestWord = this.findClosestWord(
				this.currentLineMisspelledWords,
				cursor
			);
			if (!closestWord) return;

			this.currentMisspelledIndex =
				this.currentLineMisspelledWords.findIndex(
					(w) =>
						w.from.ch === closestWord.from.ch &&
						w.to.ch === closestWord.to.ch
				);
		} else {
			this.currentMisspelledIndex =
				(this.currentMisspelledIndex + 1) %
				this.currentLineMisspelledWords.length;
		}

		const targetWord =
			this.currentLineMisspelledWords[this.currentMisspelledIndex];

		if (this.cycleResetTimeout) {
			clearTimeout(this.cycleResetTimeout);
		}
		this.cycleResetTimeout = setTimeout(() => {
			this.resetCyclingState();
		}, 1000);

		this.showSpellingSuggestionsMenu(editor, view, targetWord);
	}

	findMisspelledWordsInLine(
		lineText: string,
		lineNumber: number
	): MisspelledWord[] {
		const misspelled: MisspelledWord[] = [];

		const wordRegex = /\b[a-zA-Z']+\b/g;
		let match;

		while ((match = wordRegex.exec(lineText)) !== null) {
			const word = match[0];

			if (word.length < 2) continue;

			if (!this.spell.correct(word)) {
				misspelled.push({
					word: word,
					from: { line: lineNumber, ch: match.index },
					to: { line: lineNumber, ch: match.index + word.length },
				});
			}
		}

		misspelled.sort((a, b) => a.from.ch - b.from.ch);
		return misspelled;
	}

	findClosestWord(
		words: MisspelledWord[],
		cursor: EditorPosition
	): MisspelledWord | null {
		if (words.length === 0) return null;

		for (const word of words) {
			if (cursor.ch >= word.from.ch && cursor.ch <= word.to.ch) {
				return word;
			}
		}

		let leftWord: MisspelledWord | null = null;
		let leftDistance = Infinity;

		for (const word of words) {
			if (word.to.ch <= cursor.ch) {
				const distance = cursor.ch - word.to.ch;
				if (distance < leftDistance) {
					leftDistance = distance;
					leftWord = word;
				}
			}
		}

		if (leftWord) return leftWord;

		let rightWord: MisspelledWord | null = null;
		let rightDistance = Infinity;

		for (const word of words) {
			if (word.from.ch > cursor.ch) {
				const distance = word.from.ch - cursor.ch;
				if (distance < rightDistance) {
					rightDistance = distance;
					rightWord = word;
				}
			}
		}

		return rightWord || words[0];
	}

	getSpellingSuggestions(word: string): string[] {
		if (this.spell) {
			return this.spell.suggest(word);
		}
		return [];
	}

	showSpellingSuggestionsMenu(
		editor: Editor,
		view: MarkdownView,
		misspelledWord: MisspelledWord
	) {
		if (this.currentMenu) {
			this.currentMenu.hide();
			this.currentMenu = null;
		}

		const suggestions = this.getSpellingSuggestions(misspelledWord.word);

		if (suggestions.length === 0) {
			return;
		}

		const menu = new Menu();
		this.currentMenu = menu;

		suggestions.slice(0, 10).forEach((suggestion) => {
			menu.addItem((item) => {
				item.setTitle(suggestion).onClick(() => {
					const savedCursor = editor.getCursor();
					editor.replaceRange(
						suggestion,
						misspelledWord.from,
						misspelledWord.to
					);

					if (
						savedCursor.line === misspelledWord.from.line &&
						savedCursor.ch > misspelledWord.from.ch
					) {
						const lengthDiff =
							suggestion.length - misspelledWord.word.length;
						editor.setCursor({
							line: savedCursor.line,
							ch: savedCursor.ch + lengthDiff,
						});
					} else {
						editor.setCursor(savedCursor);
					}
				});
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(`Add "${misspelledWord.word}" to dictionary`)
				.setIcon("plus")
				.onClick(async () => {
					if (this.spell) {
						this.spell.add(misspelledWord.word);
					}

					const currentWords = this.settings.customDictionary
						? this.settings.customDictionary.split("\n")
						: [];

					if (!currentWords.includes(misspelledWord.word)) {
						currentWords.push(misspelledWord.word);
						this.settings.customDictionary =
							currentWords.join("\n");
						await this.saveSettings();
					}

					new Notice(`Added "${misspelledWord.word}" to dictionary`);
				});
		});

		menu.onHide(() => {
			this.currentMenu = null;
		});

		const cm = (editor as any).cm;
		if (cm) {
			const wordMiddlePos = {
				line: misspelledWord.from.line,
				ch:
					misspelledWord.from.ch +
					Math.floor(misspelledWord.word.length / 2),
			};
			const offset = editor.posToOffset(wordMiddlePos);
			const coords = cm.coordsAtPos(offset);

			if (coords) {
				menu.showAtPosition({ x: coords.left, y: coords.bottom });
				return;
			}
		}
		const cursor = editor.getCursor();
		const cursorOffset = editor.posToOffset(cursor);
		const fallbackCoords = cm?.coordsAtPos(cursorOffset);
		if (fallbackCoords) {
			menu.showAtPosition({
				x: fallbackCoords.left,
				y: fallbackCoords.bottom,
			});
		} else {
			menu.showAtPosition({ x: 100, y: 100 });
		}
	}

	onunload() {
		if (this.cycleResetTimeout) {
			clearTimeout(this.cycleResetTimeout);
		}
	}
}

class SelectSpellCheckSettingTab extends PluginSettingTab {
	plugin: SelectSpellCheckPlugin;

	constructor(app: App, plugin: SelectSpellCheckPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Custom dictionary")
			.setDesc("Add custom words to your dictionary (one per line)")
			.addTextArea((text) =>
				text
					.setPlaceholder("Enter words, one per line")
					.setValue(this.plugin.settings.customDictionary)
					.onChange(async (value) => {
						this.plugin.settings.customDictionary = value;
						await this.plugin.saveSettings();
						await this.plugin.loadDictionary();
					})
			);
	}
}
