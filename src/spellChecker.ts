import { Editor, EditorPosition, MarkdownView, Menu, Notice } from "obsidian";
import type SelectSpellCheckPlugin from "../main";

export interface MisspelledWord {
	word: string;
	from: EditorPosition;
	to: EditorPosition;
}

export class SpellChecker {
	private plugin: SelectSpellCheckPlugin;
	private currentLineMisspelledWords: MisspelledWord[] = [];
	private currentMisspelledIndex: number = -1;
	private lastLineChecked: number = -1;
	private currentMenu: Menu | null = null;
	private cycleResetTimeout: NodeJS.Timeout | null = null;

	constructor(plugin: SelectSpellCheckPlugin) {
		this.plugin = plugin;
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

	cleanup() {
		if (this.cycleResetTimeout) {
			clearTimeout(this.cycleResetTimeout);
		}
	}

	acceptTopSuggestion(editor: Editor, view: MarkdownView) {
		if (!this.plugin.spell) {
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

	acceptAllTopSuggestions(editor: Editor, view: MarkdownView) {
		if (!this.plugin.spell) {
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

		const savedCursor = editor.getCursor();
		let totalLengthDiff = 0;

		for (let i = misspelledWords.length - 1; i >= 0; i--) {
			const word = misspelledWords[i];
			const suggestions = this.getSpellingSuggestions(word.word);

			if (suggestions.length > 0) {
				const lengthDiff = suggestions[0].length - word.word.length;
				editor.replaceRange(suggestions[0], word.from, word.to);

				if (savedCursor.ch > word.from.ch) {
					totalLengthDiff += lengthDiff;
				}
			}
		}

		editor.setCursor({
			line: savedCursor.line,
			ch: savedCursor.ch + totalLengthDiff,
		});
	}

	openSpellingMenu(editor: Editor, view: MarkdownView) {
		if (!this.plugin.spell) {
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

	private findMisspelledWordsInLine(
		lineText: string,
		lineNumber: number
	): MisspelledWord[] {
		const misspelled: MisspelledWord[] = [];

		const wordRegex = /\b[a-zA-Z']+\b/g;
		let match;

		while ((match = wordRegex.exec(lineText)) !== null) {
			const word = match[0];

			if (word.length < 2) continue;

			if (!this.plugin.spell?.correct(word)) {
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

	private findClosestWord(
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

	private getSpellingSuggestions(word: string): string[] {
		if (this.plugin.spell) {
			return this.plugin.spell.suggest(word);
		}
		return [];
	}

	private showSpellingSuggestionsMenu(
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

		// Native (Electron) menus grab the keyboard, which breaks number-key
		// selection and the keydown handler below. Native menus are the
		// default on macOS, so opt out explicitly.
		const menu = new Menu().setUseNativeMenu(false);
		this.currentMenu = menu;

		const applySuggestion = (suggestion: string) => {
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
		};

		const topSuggestions = suggestions.slice(0, 10);
		topSuggestions.forEach((suggestion, index) => {
			menu.addItem((item) => {
				const number = index === 9 ? 0 : index + 1;

				item.onClick(() => {
					applySuggestion(suggestion);
				});

				// Set the title via the public API: replacing `item.dom`
				// leaves `titleEl` empty, and native menus build their
				// labels from `titleEl`, so the suggestions rendered blank.
				const title = createFragment();
				if (this.plugin.settings.enableNumberKeySelection) {
					title.createSpan({
						cls: "spell-check-suggestion-number",
						text: `${number}`,
					});
				}
				title.createSpan({ text: suggestion });
				item.setTitle(title);
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(`Add "${misspelledWord.word}" to dictionary`)
				.setIcon("plus")
				.onClick(async () => {
					if (this.plugin.spell) {
						this.plugin.spell.add(misspelledWord.word);
					}

					const currentWords = this.plugin.settings.customDictionary
						? this.plugin.settings.customDictionary.split("\n")
						: [];

					if (!currentWords.includes(misspelledWord.word)) {
						currentWords.push(misspelledWord.word);
						this.plugin.settings.customDictionary =
							currentWords.join("\n");
						await this.plugin.saveSettings();
					}

					new Notice(`Added "${misspelledWord.word}" to dictionary`);
				});
		});

		const keyHandler = (e: KeyboardEvent) => {
			const navigationKeys = [
				"ArrowUp",
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
				"Enter",
				"Escape",
				"Tab",
			];

			const isNumberKey = /^[0-9]$/.test(e.key);

			if (isNumberKey && this.plugin.settings.enableNumberKeySelection) {
				e.preventDefault();
				e.stopPropagation();

				const num = e.key === "0" ? 10 : parseInt(e.key);
				const index = num - 1;

				if (index < topSuggestions.length) {
					applySuggestion(topSuggestions[index]);
					menu.hide();
				}
			} else if (!navigationKeys.includes(e.key)) {
				menu.hide();
			}
		};

		document.addEventListener("keydown", keyHandler);

		menu.onHide(() => {
			document.removeEventListener("keydown", keyHandler);
			this.currentMenu = null;
		});

		const cm = (
			editor as {
				cm?: {
					coordsChar: (coords: {
						left: number;
						top: number;
					}) => unknown;
					coordsAtPos: (
						offset: number
					) => { left: number; top: number; bottom: number } | null;
				};
			}
		).cm;
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
}
