/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { BaseCellRenderTemplate, CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, getNotebookEditorFromEditorPane, IActiveNotebookEditor, ICellViewModel, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_HAS_RUNNING_CELL, CHANGE_CELL_LANGUAGE, QUIT_EDIT_CELL_COMMAND_ID, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_CELL_EXECUTING, NOTEBOOK_MISSING_KERNEL_EXTENSION, cellRangeToViewCells } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellEditType, CellKind, ICellEditOperation, isDocumentExcludePattern, NotebookCellExecutionState, TransientCellMetadata, TransientDocumentMetadata, SelectionStateType, ICellReplaceEdit, OpenGettingStarted, ConsolidatedRunButton } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange, isICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { EditorsOrder, IEditorCommandsContext } from 'vs/workbench/common/editor';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { Iterable } from 'vs/base/common/iterator';
import { flatten, maxIndex, minIndex } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Mimes } from 'vs/base/common/mime';
import { TypeConstraint } from 'vs/base/common/types';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { MarshalledId } from 'vs/base/common/marshalling';

// Kernel Command
export const SELECT_KERNEL_ID = 'notebook.selectKernel';

// Notebook Commands
const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = 'notebook.clearAllCellsOutputs';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';

// Cell Commands
const EDIT_CELL_COMMAND_ID = 'notebook.cell.edit';
const DELETE_CELL_COMMAND_ID = 'notebook.cell.delete';

const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.executeAndFocusContainer';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const EXECUTE_CELL_AND_BELOW = 'notebook.cell.executeCellAndBelow';
const EXECUTE_CELLS_ABOVE = 'notebook.cell.executeCellsAbove';
const CLEAR_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.clearOutputs';
const TOGGLE_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.toggleOutputs';
const CENTER_ACTIVE_CELL = 'notebook.centerActiveCell';

export const NOTEBOOK_ACTIONS_CATEGORY = { value: localize('notebookActions.category', "Notebook"), original: 'Notebook' };

export const CELL_TITLE_CELL_GROUP_ID = 'inline/cell';
export const CELL_TITLE_OUTPUT_GROUP_ID = 'inline/output';

export const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib; // smaller than Suggest Widget, etc

export const enum CellToolbarOrder {
	EditCell,
	ExecuteAboveCells,
	ExecuteCellAndBelow,
	SplitCell,
	SaveCell,
	ClearCellOutput
}

export const enum CellOverflowToolbarGroups {
	Copy = '1_copy',
	Insert = '2_insert',
	Edit = '3_edit',
	Collapse = '4_collapse',
}

export interface INotebookActionContext {
	readonly cellTemplate?: BaseCellRenderTemplate;
	readonly cell?: ICellViewModel;
	readonly notebookEditor: IActiveNotebookEditor;
	readonly ui?: boolean;
	readonly selectedCells?: readonly ICellViewModel[];
	readonly autoReveal?: boolean;
}

export interface INotebookCellToolbarActionContext extends INotebookActionContext {
	readonly ui: true;
	readonly cell: ICellViewModel;
}

export interface INotebookCommandContext extends INotebookActionContext {
	readonly ui: false;
	readonly selectedCells: readonly ICellViewModel[];
}

export interface INotebookCellActionContext extends INotebookActionContext {
	cell: ICellViewModel;
}

export function getContextFromActiveEditor(editorService: IEditorService): INotebookActionContext | undefined {
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	if (!editor || !editor.hasModel()) {
		return;
	}

	const activeCell = editor.getActiveCell();
	const selectedCells = editor.getSelectionViewModels();
	return {
		cell: activeCell,
		selectedCells,
		notebookEditor: editor
	};
}

function getWidgetFromUri(accessor: ServicesAccessor, uri: URI) {
	const notebookEditorService = accessor.get(INotebookEditorService);
	const widget = notebookEditorService.listNotebookEditors().find(widget => widget.hasModel() && widget.textModel.uri.toString() === uri.toString());

	if (widget && widget.hasModel()) {
		return widget;
	}

	return undefined;
}

function getContextFromUri(accessor: ServicesAccessor, context?: any) {
	const uri = URI.revive(context);

	if (uri) {
		const widget = getWidgetFromUri(accessor, uri);

		if (widget) {
			return {
				notebookEditor: widget,
			};
		}
	}

	return undefined;
}

export abstract class NotebookAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: NOTEBOOK_IS_ACTIVE_EDITOR
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.category = NOTEBOOK_ACTIONS_CATEGORY;

		super(desc);
	}

	async run(accessor: ServicesAccessor, context?: any, ...additionalArgs: any[]): Promise<void> {
		const isFromUI = !!context;
		const from = isFromUI ? (this.isNotebookActionContext(context) ? 'notebookToolbar' : 'editorToolbar') : undefined;
		if (!this.isNotebookActionContext(context)) {
			context = this.getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs);
			if (!context) {
				return;
			}
		}

		if (from !== undefined) {
			const telemetryService = accessor.get(ITelemetryService);
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
		}

		return this.runWithContext(accessor, context);
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void>;

	private isNotebookActionContext(context?: unknown): context is INotebookActionContext {
		return !!context && !!(context as INotebookActionContext).notebookEditor;
	}

	protected getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: any, ...additionalArgs: any[]): INotebookActionContext | undefined {
		return getContextFromActiveEditor(accessor.get(IEditorService));
	}
}

// todo@rebornix, replace NotebookAction with this
export abstract class NotebookMultiCellAction extends Action2 {
	constructor(desc: IAction2Options) {
		if (desc.f1 !== false) {
			desc.f1 = false;
			const f1Menu = {
				id: MenuId.CommandPalette,
				when: NOTEBOOK_IS_ACTIVE_EDITOR
			};

			if (!desc.menu) {
				desc.menu = [];
			} else if (!Array.isArray(desc.menu)) {
				desc.menu = [desc.menu];
			}

			desc.menu = [
				...desc.menu,
				f1Menu
			];
		}

		desc.category = NOTEBOOK_ACTIONS_CATEGORY;

		super(desc);
	}

	parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return undefined;
	}

	abstract runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void>;

	private isCellToolbarContext(context?: unknown): context is INotebookCellToolbarActionContext {
		return !!context && !!(context as INotebookActionContext).notebookEditor && (context as any).$mid === MarshalledId.NotebookCellActionContext;
	}
	private isEditorContext(context?: unknown): boolean {
		return !!context && (context as IEditorCommandsContext).groupId !== undefined;
	}

	/**
	 * The action/command args are resolved in following order
	 * `run(accessor, cellToolbarContext)` from cell toolbar
	 * `run(accessor, ...args)` from command service with arguments
	 * `run(accessor, undefined)` from keyboard shortcuts, command palatte, etc
	 */
	async run(accessor: ServicesAccessor, ...additionalArgs: any[]): Promise<void> {
		const context = additionalArgs[0];
		const isFromCellToolbar = this.isCellToolbarContext(context);
		const isFromEditorToolbar = this.isEditorContext(context);
		const from = isFromCellToolbar ? 'cellToolbar' : (isFromEditorToolbar ? 'editorToolbar' : 'other');
		const telemetryService = accessor.get(ITelemetryService);

		if (isFromCellToolbar) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
			return this.runWithContext(accessor, context);
		}

		// handle parsed args

		const parsedArgs = this.parseArgs(accessor, ...additionalArgs);
		if (parsedArgs) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });
			return this.runWithContext(accessor, parsedArgs);
		}

		// no parsed args, try handle active editor
		const editor = getEditorFromArgsOrActivePane(accessor);
		if (editor) {
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: from });

			return this.runWithContext(accessor, {
				ui: false,
				notebookEditor: editor,
				selectedCells: cellRangeToViewCells(editor.viewModel, editor.getSelections())
			});
		}
	}
}

export abstract class NotebookCellAction<T = INotebookCellActionContext> extends NotebookAction {
	protected isCellActionContext(context?: unknown): context is INotebookCellActionContext {
		return !!context && !!(context as INotebookCellActionContext).notebookEditor && !!(context as INotebookCellActionContext).cell;
	}

	protected getCellContextFromArgs(accessor: ServicesAccessor, context?: T, ...additionalArgs: any[]): INotebookCellActionContext | undefined {
		return undefined;
	}

	override async run(accessor: ServicesAccessor, context?: INotebookCellActionContext, ...additionalArgs: any[]): Promise<void> {
		if (this.isCellActionContext(context)) {
			const telemetryService = accessor.get(ITelemetryService);
			telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: this.desc.id, from: 'cellToolbar' });

			return this.runWithContext(accessor, context);
		}

		const contextFromArgs = this.getCellContextFromArgs(accessor, context, ...additionalArgs);

		if (contextFromArgs) {
			return this.runWithContext(accessor, contextFromArgs);
		}

		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
		if (this.isCellActionContext(activeEditorContext)) {
			return this.runWithContext(accessor, activeEditorContext);
		}
	}

	abstract override runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void>;
}

// If this changes, update getCodeCellExecutionContextKeyService to match
const executeCondition = ContextKeyExpr.and(
	NOTEBOOK_CELL_TYPE.isEqualTo('code'),
	ContextKeyExpr.or(
		ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0),
		NOTEBOOK_MISSING_KERNEL_EXTENSION
	));

const executeThisCellCondition = ContextKeyExpr.and(
	executeCondition,
	NOTEBOOK_CELL_EXECUTING.toNegated());

const executeNotebookCondition = ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0);

interface IMultiCellArgs {
	ranges: ICellRange[];
	document?: URI;
	autoReveal?: boolean;
}

function isMultiCellArgs(arg: unknown): arg is IMultiCellArgs {
	if (arg === undefined) {
		return false;
	}
	const ranges = (arg as IMultiCellArgs).ranges;
	if (!ranges) {
		return false;
	}

	if (!Array.isArray(ranges) || ranges.some(range => !isICellRange(range))) {
		return false;
	}

	if ((arg as IMultiCellArgs).document) {
		const uri = URI.revive((arg as IMultiCellArgs).document);

		if (!uri) {
			return false;
		}
	}

	return true;
}

function getEditorFromArgsOrActivePane(accessor: ServicesAccessor, context?: UriComponents): IActiveNotebookEditor | undefined {
	const editorFromUri = getContextFromUri(accessor, context)?.notebookEditor;

	if (editorFromUri) {
		return editorFromUri;
	}

	const editor = getNotebookEditorFromEditorPane(accessor.get(IEditorService).activeEditorPane);
	if (!editor || !editor.hasModel()) {
		return;
	}

	return editor;
}

function parseMultiCellExecutionArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
	const firstArg = args[0];

	if (isMultiCellArgs(firstArg)) {
		const editor = getEditorFromArgsOrActivePane(accessor, firstArg.document);
		if (!editor) {
			return;
		}

		const ranges = firstArg.ranges;
		const selectedCells = flatten(ranges.map(range => editor.viewModel.getCells(range).slice(0)));
		const autoReveal = firstArg.autoReveal;
		return {
			ui: false,
			notebookEditor: editor,
			selectedCells,
			autoReveal
		};
	}

	// handle legacy arguments
	if (isICellRange(firstArg)) {
		// cellRange, document
		const secondArg = args[1];
		const editor = getEditorFromArgsOrActivePane(accessor, secondArg);
		if (!editor) {
			return;
		}

		return {
			ui: false,
			notebookEditor: editor,
			selectedCells: editor.viewModel.getCells(firstArg)
		};
	}

	// let's just execute the active cell
	const context = getContextFromActiveEditor(accessor.get(IEditorService));
	return context ? {
		ui: false,
		notebookEditor: context.notebookEditor,
		selectedCells: context.selectedCells ?? []
	} : undefined;
}

registerAction2(class ExecuteAboveCells extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELLS_ABOVE,
			precondition: executeCondition,
			title: localize('notebookActions.executeAbove', "Execute Above Cells"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteAboveCells,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, false))
				}
			],
			icon: icons.executeAboveIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let endCellIdx: number | undefined = undefined;
		if (context.ui) {
			endCellIdx = context.notebookEditor.viewModel.getCellIndex(context.cell);
		} else {
			endCellIdx = maxIndex(context.selectedCells, cell => context.notebookEditor.viewModel.getCellIndex(cell));
		}

		if (typeof endCellIdx === 'number') {
			const range = { start: 0, end: endCellIdx };
			const cells = context.notebookEditor.viewModel.getCells(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

registerAction2(class ExecuteCellAndBelow extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_AND_BELOW,
			precondition: executeCondition,
			title: localize('notebookActions.executeBelow', "Execute Cell and Below"),
			menu: [
				{
					id: MenuId.NotebookCellExecute,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, true))
				},
				{
					id: MenuId.NotebookCellTitle,
					order: CellToolbarOrder.ExecuteCellAndBelow,
					group: CELL_TITLE_CELL_GROUP_ID,
					when: ContextKeyExpr.and(
						executeCondition,
						ContextKeyExpr.equals(`config.${ConsolidatedRunButton}`, false))
				}
			],
			icon: icons.executeBelowIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		let startCellIdx: number | undefined = undefined;
		if (context.ui) {
			startCellIdx = context.notebookEditor.viewModel.getCellIndex(context.cell);
		} else {
			startCellIdx = minIndex(context.selectedCells, cell => context.notebookEditor.viewModel.getCellIndex(cell));
		}

		if (typeof startCellIdx === 'number') {
			const range = { start: startCellIdx, end: context.notebookEditor.viewModel.viewCells.length };
			const cells = context.notebookEditor.viewModel.getCells(range);
			context.notebookEditor.executeNotebookCells(cells);
		}
	}
});

const cellExecutionArgs: ReadonlyArray<{
	readonly name: string;
	readonly isOptional?: boolean;
	readonly description?: string;
	readonly constraint?: TypeConstraint;
	readonly schema?: IJSONSchema;
}> = [
		{
			isOptional: true,
			name: 'options',
			description: 'The cell range options',
			schema: {
				'type': 'object',
				'required': ['ranges'],
				'properties': {
					'ranges': {
						'type': 'array',
						items: [
							{
								'type': 'object',
								'required': ['start', 'end'],
								'properties': {
									'start': {
										'type': 'number'
									},
									'end': {
										'type': 'number'
									}
								}
							}
						]
					},
					'document': {
						'type': 'object',
						'description': 'The document uri',
					},
					'autoReveal': {
						'type': 'boolean',
						'description': 'Whether the cell should be revealed into view automatically'
					}
				}
			}
		}
	];

registerAction2(class ExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.execute', "Execute Cell"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.WinCtrl | KeyCode.Enter,
				win: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
				},
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
			menu: {
				id: MenuId.NotebookCellExecute,
				when: executeThisCellCondition,
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.execute', "Execute Cell"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		return runCell(accessor, context);
	}
});

registerAction2(class ExecuteCellFocusContainer extends NotebookMultiCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
			description: {
				description: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
				args: cellExecutionArgs
			},
			icon: icons.executeIcon
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
		} else {
			const firstCell = context.selectedCells[0];

			if (firstCell) {
				context.notebookEditor.focusNotebookCell(firstCell, 'container', { skipReveal: true });
			}
		}

		await runCell(accessor, context);
	}
});

const cellCancelCondition = ContextKeyExpr.or(
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'executing'),
	ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'pending'),
);

registerAction2(class CancelExecuteCell extends NotebookMultiCellAction {
	constructor() {
		super({
			id: CANCEL_CELL_COMMAND_ID,
			precondition: cellCancelCondition,
			title: localize('notebookActions.cancel', "Stop Cell Execution"),
			icon: icons.stopIcon,
			menu: {
				id: MenuId.NotebookCellExecute,
				when: cellCancelCondition,
				group: 'inline'
			},
			description: {
				description: localize('notebookActions.cancel', "Stop Cell Execution"),
				args: [
					{
						name: 'options',
						description: 'The cell range options',
						schema: {
							'type': 'object',
							'required': ['ranges'],
							'properties': {
								'ranges': {
									'type': 'array',
									items: [
										{
											'type': 'object',
											'required': ['start', 'end'],
											'properties': {
												'start': {
													'type': 'number'
												},
												'end': {
													'type': 'number'
												}
											}
										}
									]
								},
								'document': {
									'type': 'object',
									'description': 'The document uri',
								}
							}
						}
					}
				]
			},
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		if (context.ui) {
			return context.notebookEditor.cancelNotebookCells(Iterable.single(context.cell));
		} else {
			return context.notebookEditor.cancelNotebookCells(context.selectedCells);
		}
	}
});

registerAction2(class extends NotebookMultiCellAction {
	constructor() {
		super({
			id: TOGGLE_CELL_OUTPUTS_COMMAND_ID,
			precondition: NOTEBOOK_CELL_LIST_FOCUSED,
			title: localize('notebookActions.toggleOutputs', "Toggle Outputs"),
			description: {
				description: localize('notebookActions.toggleOutputs', "Toggle Outputs"),
				args: cellExecutionArgs
			}
		});
	}

	override parseArgs(accessor: ServicesAccessor, ...args: any[]): INotebookCommandContext | undefined {
		return parseMultiCellExecutionArgs(accessor, ...args);
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCommandContext | INotebookCellToolbarActionContext): Promise<void> {
		const textModel = context.notebookEditor.viewModel.notebookDocument;
		let cells: ICellViewModel[] = [];
		if (context.ui) {
			cells = [context.cell];
		} else if (context.selectedCells) {
			cells = [...context.selectedCells];
		} else {
			cells = [...context.notebookEditor.viewModel.getCells()];
		}

		const edits: ICellEditOperation[] = [];
		for (const cell of cells) {
			const index = textModel.cells.indexOf(cell.model);
			if (index >= 0) {
				edits.push({ editType: CellEditType.Metadata, index, metadata: { ...cell.metadata, outputCollapsed: !cell.metadata.outputCollapsed } });
			}
		}

		textModel.applyEdits(edits, true, undefined, () => undefined, undefined);
	}
});

export class DeleteCellAction extends MenuItemAction {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService
	) {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				icon: icons.deleteCellIcon,
				precondition: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
			},
			undefined,
			{ shouldForwardArgs: true },
			contextKeyService,
			commandService);
	}
}

registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_SELECT_BELOW,
			precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
			title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const idx = context.notebookEditor.viewModel.getCellIndex(context.cell);
		if (typeof idx !== 'number') {
			return;
		}

		if (context.cell.cellKind === CellKind.Markup) {
			const nextCell = context.notebookEditor.viewModel.cellAt(idx + 1);
			context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_SELECT_BELOW);
			if (nextCell) {
				context.notebookEditor.focusNotebookCell(nextCell, 'container');
			} else {
				const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Markup, 'below');
				if (newCell) {
					context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			}
			return;
		} else {
			// Try to select below, fall back on inserting
			const nextCell = context.notebookEditor.viewModel.cellAt(idx + 1);
			if (nextCell) {
				context.notebookEditor.focusNotebookCell(nextCell, 'container');
			} else {
				const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
				if (newCell) {
					context.notebookEditor.focusNotebookCell(newCell, 'editor');
				}
			}

			return runCell(accessor, context);
		}
	}
});

registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
	constructor() {
		super({
			id: EXECUTE_CELL_INSERT_BELOW,
			precondition: executeThisCellCondition,
			title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
			keybinding: {
				when: NOTEBOOK_CELL_LIST_FOCUSED,
				primary: KeyMod.Alt | KeyCode.Enter,
				weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? 'editor' : 'container';

		const executionP = runCell(accessor, context);
		const newCell = context.notebookEditor.insertNotebookCell(context.cell, CellKind.Code, 'below');
		if (newCell) {
			context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
		}

		return executionP;
	}
});

registerAction2(class RenderAllMarkdownCellsAction extends NotebookAction {
	constructor() {
		super({
			id: RENDER_ALL_MARKDOWN_CELLS,
			title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);
	}
});

registerAction2(class ExecuteNotebookAction extends NotebookAction {
	constructor() {
		super({
			id: EXECUTE_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.executeNotebook', "Run All"),
			icon: icons.executeAllIcon,
			description: {
				description: localize('notebookActions.executeNotebook', "Run All"),
				args: [
					{
						name: 'uri',
						description: 'The document uri'
					}
				]
			},
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						executeNotebookCondition,
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_RUNNING_CELL.toNegated()),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						executeNotebookCondition,
						ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_RUNNING_CELL.toNegated()),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		renderAllMarkdownCells(context);

		const editorService = accessor.get(IEditorService);
		const editor = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).find(
			editor => editor.editor instanceof NotebookEditorInput && editor.editor.viewType === context.notebookEditor.viewModel.viewType && editor.editor.resource.toString() === context.notebookEditor.viewModel.uri.toString());
		const editorGroupService = accessor.get(IEditorGroupsService);

		if (editor) {
			const group = editorGroupService.getGroup(editor.groupId);
			group?.pinEditor(editor.editor);
		}

		return context.notebookEditor.executeNotebookCells();
	}
});

function renderAllMarkdownCells(context: INotebookActionContext): void {
	context.notebookEditor.viewModel.viewCells.forEach(cell => {
		if (cell.cellKind === CellKind.Markup) {
			cell.updateEditState(CellEditState.Preview, 'renderAllMarkdownCells');
		}
	});
}

registerAction2(class CancelNotebook extends NotebookAction {
	constructor() {
		super({
			id: CANCEL_NOTEBOOK_COMMAND_ID,
			title: localize('notebookActions.cancelNotebook', "Stop Execution"),
			icon: icons.stopIcon,
			description: {
				description: localize('notebookActions.cancelNotebook', "Stop Execution"),
				args: [
					{
						name: 'uri',
						description: 'The document uri',
						constraint: URI
					}
				]
			},
			menu: [
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_HAS_RUNNING_CELL,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation/execute',
					when: ContextKeyExpr.and(
						NOTEBOOK_HAS_RUNNING_CELL,
						NOTEBOOK_INTERRUPTIBLE_KERNEL,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					)
				}
			]
		});
	}

	override getEditorContextFromArgsOrActive(accessor: ServicesAccessor, context?: UriComponents): INotebookActionContext | undefined {
		return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		return context.notebookEditor.cancelNotebookCells();
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
	submenu: MenuId.NotebookCellInsert,
	title: localize('notebookMenu.insertCell', "Insert Cell"),
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	submenu: MenuId.NotebookCellTitle,
	title: localize('notebookMenu.cellTitle', "Notebook Cell"),
	group: CellOverflowToolbarGroups.Insert,
	when: NOTEBOOK_EDITOR_FOCUSED
});


async function runCell(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {

	const editorGroupService = accessor.get(IEditorGroupsService);
	const group = editorGroupService.activeGroup;

	if (group) {
		if (group.activeEditor) {
			group.pinEditor(group.activeEditor);
		}
	}

	if (context.ui && context.cell) {
		if (context.cell.internalMetadata.runState === NotebookCellExecutionState.Executing) {
			return;
		}
		await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
		if (context.autoReveal) {
			const cellIndex = context.notebookEditor.viewModel.getCellIndex(context.cell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	} else if (context.selectedCells) {
		await context.notebookEditor.executeNotebookCells(context.selectedCells);
		const firstCell = context.selectedCells[0];

		if (firstCell && context.autoReveal) {
			const cellIndex = context.notebookEditor.viewModel.getCellIndex(firstCell);
			context.notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
		}
	}
}

export async function changeCellToKind(kind: CellKind, context: INotebookActionContext, language?: string, mime?: string): Promise<void> {
	const { notebookEditor } = context;
	if (!notebookEditor.viewModel) {
		return;
	}

	if (notebookEditor.viewModel.options.isReadOnly) {
		return;
	}

	if (context.ui && context.cell) {
		// action from UI
		const { cell } = context;

		if (cell.cellKind === kind) {
			return;
		}

		const text = cell.getText();
		const idx = notebookEditor.viewModel.getCellIndex(cell);

		if (language === undefined) {
			const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
			language = availableLanguages[0] ?? 'plaintext';
		}

		notebookEditor.textModel.applyEdits([
			{
				editType: CellEditType.Replace,
				index: idx,
				count: 1,
				cells: [{
					cellKind: kind,
					source: text,
					language: language!,
					mime: mime ?? cell.mime,
					outputs: cell.model.outputs,
					metadata: cell.metadata,
				}]
			}
		], true, {
			kind: SelectionStateType.Index,
			focus: notebookEditor.getFocus(),
			selections: notebookEditor.getSelections()
		}, () => {
			return {
				kind: SelectionStateType.Index,
				focus: notebookEditor.getFocus(),
				selections: notebookEditor.getSelections()
			};
		}, undefined, true);
		const newCell = notebookEditor.viewModel.cellAt(idx);

		if (!newCell) {
			return;
		}

		notebookEditor.focusNotebookCell(newCell, cell.getEditState() === CellEditState.Editing ? 'editor' : 'container');
	} else if (context.selectedCells) {
		const selectedCells = context.selectedCells;
		const rawEdits: ICellEditOperation[] = [];

		selectedCells.forEach(cell => {
			if (cell.cellKind === kind) {
				return;
			}
			const text = cell.getText();
			const idx = notebookEditor.viewModel.getCellIndex(cell);

			if (language === undefined) {
				const availableLanguages = notebookEditor.activeKernel?.supportedLanguages ?? [];
				language = availableLanguages[0] ?? 'plaintext';
			}

			rawEdits.push(
				{
					editType: CellEditType.Replace,
					index: idx,
					count: 1,
					cells: [{
						cellKind: kind,
						source: text,
						language: language!,
						mime: mime ?? cell.mime,
						outputs: cell.model.outputs,
						metadata: cell.metadata,
					}]
				}
			);
		});

		notebookEditor.textModel.applyEdits(rawEdits, true, {
			kind: SelectionStateType.Index,
			focus: notebookEditor.getFocus(),
			selections: notebookEditor.getSelections()
		}, () => {
			return {
				kind: SelectionStateType.Index,
				focus: notebookEditor.getFocus(),
				selections: notebookEditor.getSelections()
			};
		}, undefined, true);
	}
}

registerAction2(class EditCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.editCell', "Edit Cell"),
				keybinding: {
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_LIST_FOCUSED,
						ContextKeyExpr.not(InputFocusedContextKey),
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)),
					primary: KeyCode.Enter,
					weight: KeybindingWeight.WorkbenchContrib
				},
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
						NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(),
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.EditCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.editIcon,
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const viewModel = context.notebookEditor.viewModel;
		if (!viewModel || viewModel.options.isReadOnly) {
			return;
		}

		context.notebookEditor.focusNotebookCell(context.cell, 'editor');
	}
});

const quitEditCondition = ContextKeyExpr.and(
	NOTEBOOK_EDITOR_FOCUSED,
	InputFocusedContext
);
registerAction2(class QuitEditCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: QUIT_EDIT_CELL_COMMAND_ID,
				title: localize('notebookActions.quitEdit', "Stop Editing Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_CELL_TYPE.isEqualTo('markup'),
						NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
						NOTEBOOK_CELL_EDITABLE),
					order: CellToolbarOrder.SaveCell,
					group: CELL_TITLE_CELL_GROUP_ID
				},
				icon: icons.stopEditIcon,
				keybinding: [
					{
						when: ContextKeyExpr.and(quitEditCondition,
							EditorContextKeys.hoverVisible.toNegated(),
							EditorContextKeys.hasNonEmptySelection.toNegated(),
							EditorContextKeys.hasMultipleSelections.toNegated()),
						primary: KeyCode.Escape,
						weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
					},
					{
						when: ContextKeyExpr.and(
							quitEditCondition,
							NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
						primary: KeyMod.WinCtrl | KeyCode.Enter,
						win: {
							primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
						},
						weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
					},
				]
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		if (context.cell.cellKind === CellKind.Markup) {
			context.cell.updateEditState(CellEditState.Preview, QUIT_EDIT_CELL_COMMAND_ID);
		}

		context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
	}
});

export function runDeleteAction(viewModel: NotebookViewModel, cell: ICellViewModel) {
	const selections = viewModel.getSelections();
	const targetCellIndex = viewModel.getCellIndex(cell);
	const containingSelection = selections.find(selection => selection.start <= targetCellIndex && targetCellIndex < selection.end);

	if (containingSelection) {
		const edits: ICellReplaceEdit[] = selections.reverse().map(selection => ({
			editType: CellEditType.Replace, index: selection.start, count: selection.end - selection.start, cells: []
		}));

		const nextCellAfterContainingSelection = viewModel.cellAt(containingSelection.end);

		viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => {
			if (nextCellAfterContainingSelection) {
				const cellIndex = viewModel.notebookDocument.cells.findIndex(cell => cell.handle === nextCellAfterContainingSelection.handle);
				return { kind: SelectionStateType.Index, focus: { start: cellIndex, end: cellIndex + 1 }, selections: [{ start: cellIndex, end: cellIndex + 1 }] };
			} else {
				if (viewModel.notebookDocument.length) {
					const lastCellIndex = viewModel.notebookDocument.length - 1;
					return { kind: SelectionStateType.Index, focus: { start: lastCellIndex, end: lastCellIndex + 1 }, selections: [{ start: lastCellIndex, end: lastCellIndex + 1 }] };

				} else {
					return { kind: SelectionStateType.Index, focus: { start: 0, end: 0 }, selections: [{ start: 0, end: 0 }] };
				}
			}
		}, undefined);
	} else {
		const focus = viewModel.getFocus();
		const edits: ICellReplaceEdit[] = [{
			editType: CellEditType.Replace, index: targetCellIndex, count: 1, cells: []
		}];

		let finalSelections: ICellRange[] = [];
		for (let i = 0; i < selections.length; i++) {
			const selection = selections[i];

			if (selection.end <= targetCellIndex) {
				finalSelections.push(selection);
			} else if (selection.start > targetCellIndex) {
				finalSelections.push({ start: selection.start - 1, end: selection.end - 1 });
			} else {
				finalSelections.push({ start: targetCellIndex, end: targetCellIndex + 1 });
			}
		}

		if (viewModel.cellAt(focus.start) === cell) {
			// focus is the target, focus is also not part of any selection
			const newFocus = focus.end === viewModel.length ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined);
		} else {
			// users decide to delete a cell out of current focus/selection
			const newFocus = focus.start > targetCellIndex ? { start: focus.start - 1, end: focus.end - 1 } : focus;

			viewModel.notebookDocument.applyEdits(edits, true, { kind: SelectionStateType.Index, focus: viewModel.getFocus(), selections: viewModel.getSelections() }, () => ({
				kind: SelectionStateType.Index, focus: newFocus, selections: finalSelections
			}), undefined);
		}
	}
}

registerAction2(class DeleteCellAction extends NotebookCellAction {
	constructor() {
		super(
			{
				id: DELETE_CELL_COMMAND_ID,
				title: localize('notebookActions.deleteCell', "Delete Cell"),
				menu: {
					id: MenuId.NotebookCellTitle,
					when: NOTEBOOK_EDITOR_EDITABLE
				},
				keybinding: {
					primary: KeyCode.Delete,
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.Backspace
					},
					when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, ContextKeyExpr.not(InputFocusedContextKey)),
					weight: KeybindingWeight.WorkbenchContrib
				},
				icon: icons.deleteCellIcon
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext) {
		const viewModel = context.notebookEditor.viewModel;
		if (!viewModel || viewModel.options.isReadOnly) {
			return;
		}

		runDeleteAction(viewModel, context.cell);
	}
});

registerAction2(class ClearCellOutputsAction extends NotebookCellAction {
	constructor() {
		super({
			id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
			title: localize('clearCellOutputs', 'Clear Cell Outputs'),
			menu: [
				{
					id: MenuId.NotebookCellTitle,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), executeNotebookCondition, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.toNegated()),
					order: CellToolbarOrder.ClearCellOutput,
					group: CELL_TITLE_OUTPUT_GROUP_ID
				},
				{
					id: MenuId.NotebookOutputToolbar,
					when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE)
				},
			],
			keybinding: {
				when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
				primary: KeyMod.Alt | KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			},
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.hasModel() || !editor.textModel.length) {
			return;
		}

		const cell = context.cell;
		const index = editor.textModel.cells.indexOf(cell.model);

		if (index < 0) {
			return;
		}

		editor.textModel.applyEdits([{ editType: CellEditType.Output, index, outputs: [] }], true, undefined, () => undefined, undefined);

		if (context.cell.internalMetadata.runState !== NotebookCellExecutionState.Executing) {
			context.notebookEditor.textModel.applyEdits([{
				editType: CellEditType.PartialInternalMetadata, index, internalMetadata: {
					runState: null,
					runStartTime: null,
					runStartTimeAdjustment: null,
					runEndTime: null,
					executionOrder: null,
					lastRunSuccess: null
				}
			}], true, undefined, () => undefined, undefined);
		}
	}
});

interface ILanguagePickInput extends IQuickPickItem {
	languageId: string;
	description: string;
}


interface IChangeCellContext extends INotebookCellActionContext {
	// TODO@rebornix : `cells`
	// range: ICellRange;
	language?: string;
}

registerAction2(class ChangeCellLanguageAction extends NotebookCellAction<ICellRange> {
	constructor() {
		super({
			id: CHANGE_CELL_LANGUAGE,
			title: localize('changeLanguage', 'Change Cell Language'),
			description: {
				description: localize('changeLanguage', 'Change Cell Language'),
				args: [
					{
						name: 'range',
						description: 'The cell range',
						schema: {
							'type': 'object',
							'required': ['start', 'end'],
							'properties': {
								'start': {
									'type': 'number'
								},
								'end': {
									'type': 'number'
								}
							}
						}
					},
					{
						name: 'language',
						description: 'The target cell language',
						schema: {
							'type': 'string'
						}
					}
				]
			}
		});
	}

	protected override getCellContextFromArgs(accessor: ServicesAccessor, context?: ICellRange, ...additionalArgs: any[]): IChangeCellContext | undefined {
		if (!context || typeof context.start !== 'number' || typeof context.end !== 'number' || context.start >= context.end) {
			return;
		}

		const language = additionalArgs.length && typeof additionalArgs[0] === 'string' ? additionalArgs[0] : undefined;
		const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);

		if (!activeEditorContext || !activeEditorContext.notebookEditor.viewModel || context.start >= activeEditorContext.notebookEditor.viewModel.length) {
			return;
		}

		// TODO@rebornix, support multiple cells
		return {
			notebookEditor: activeEditorContext.notebookEditor,
			cell: activeEditorContext.notebookEditor.viewModel.cellAt(context.start)!,
			language
		};
	}


	async runWithContext(accessor: ServicesAccessor, context: IChangeCellContext): Promise<void> {
		if (context.language) {
			await this.setLanguage(context, context.language);
		} else {
			await this.showLanguagePicker(accessor, context);
		}
	}

	private async showLanguagePicker(accessor: ServicesAccessor, context: IChangeCellContext) {
		const topItems: ILanguagePickInput[] = [];
		const mainItems: ILanguagePickInput[] = [];

		const modeService = accessor.get(IModeService);
		const modelService = accessor.get(IModelService);
		const quickInputService = accessor.get(IQuickInputService);
		const languageDetectionService = accessor.get(ILanguageDetectionService);

		const providerLanguages = new Set([
			...(context.notebookEditor.activeKernel?.supportedLanguages ?? modeService.getRegisteredModes()),
			'markdown'
		]);

		providerLanguages.forEach(languageId => {
			let description: string;
			if (context.cell.cellKind === CellKind.Markup ? (languageId === 'markdown') : (languageId === context.cell.language)) {
				description = localize('languageDescription', "({0}) - Current Language", languageId);
			} else {
				description = localize('languageDescriptionConfigured', "({0})", languageId);
			}

			const languageName = modeService.getLanguageName(languageId);
			if (!languageName) {
				// Notebook has unrecognized language
				return;
			}

			const item = <ILanguagePickInput>{
				label: languageName,
				iconClasses: getIconClasses(modelService, modeService, this.getFakeResource(languageName, modeService)),
				description,
				languageId
			};

			if (languageId === 'markdown' || languageId === context.cell.language) {
				topItems.push(item);
			} else {
				mainItems.push(item);
			}
		});

		mainItems.sort((a, b) => {
			return a.description.localeCompare(b.description);
		});

		// Offer to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			label: localize('autoDetect', "Auto Detect")
		};

		const picks: QuickPickInput[] = [
			autoDetectMode,
			{ type: 'separator', label: localize('languagesPicks', "languages (identifier)") },
			...topItems,
			{ type: 'separator' },
			...mainItems
		];

		const selection = await quickInputService.pick(picks, { placeHolder: localize('pickLanguageToConfigure', "Select Language Mode") }) as ILanguagePickInput | undefined;
		let languageId = selection === autoDetectMode
			? await languageDetectionService.detectLanguage(context.cell.uri)
			: selection?.languageId;

		if (languageId) {
			await this.setLanguage(context, languageId);
		}
	}

	private async setLanguage(context: IChangeCellContext, languageId: string) {
		if (languageId === 'markdown' && context.cell?.language !== 'markdown') {
			const idx = context.notebookEditor.viewModel.getCellIndex(context.cell);
			await changeCellToKind(CellKind.Markup, { cell: context.cell, notebookEditor: context.notebookEditor }, 'markdown', Mimes.markdown);
			const newCell = context.notebookEditor.viewModel.cellAt(idx);

			if (newCell) {
				context.notebookEditor.focusNotebookCell(newCell, 'editor');
			}
		} else if (languageId !== 'markdown' && context.cell?.cellKind === CellKind.Markup) {
			await changeCellToKind(CellKind.Code, { cell: context.cell, notebookEditor: context.notebookEditor }, languageId);
		} else {
			const index = context.notebookEditor.textModel.cells.indexOf(context.cell.model);
			context.notebookEditor.textModel.applyEdits(
				[{ editType: CellEditType.CellLanguage, index, language: languageId }],
				true, undefined, () => undefined, undefined
			);
		}
	}

	/**
	 * Copied from editorStatus.ts
	 */
	private getFakeResource(lang: string, modeService: IModeService): URI | undefined {
		let fakeResource: URI | undefined;

		const extensions = modeService.getExtensions(lang);
		if (extensions?.length) {
			fakeResource = URI.file(extensions[0]);
		} else {
			const filenames = modeService.getFilenames(lang);
			if (filenames?.length) {
				fakeResource = URI.file(filenames[0]);
			}
		}

		return fakeResource;
	}
});

registerAction2(class ClearAllCellOutputsAction extends NotebookAction {
	constructor() {
		super({
			id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
			title: localize('clearAllCellsOutputs', 'Clear Outputs'),
			precondition: NOTEBOOK_HAS_OUTPUTS,
			menu: [
				{
					id: MenuId.EditorTitle,
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)
					),
					group: 'navigation',
					order: 0
				},
				{
					id: MenuId.NotebookToolbar,
					when: ContextKeyExpr.and(
						executeNotebookCondition,
						ContextKeyExpr.equals('config.notebook.globalToolbar', true)
					),
					group: 'navigation/execute',
					order: 0
				}
			],
			icon: icons.clearIcon
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editor = context.notebookEditor;
		if (!editor.hasModel() || !editor.textModel.length) {
			return;
		}

		editor.textModel.applyEdits(
			editor.textModel.cells.map((cell, index) => ({
				editType: CellEditType.Output, index, outputs: []
			})), true, undefined, () => undefined, undefined);

		const clearExecutionMetadataEdits = editor.textModel.cells.map((cell, index) => {
			if (cell.internalMetadata.runState !== NotebookCellExecutionState.Executing) {
				return {
					editType: CellEditType.PartialInternalMetadata, index, internalMetadata: {
						runState: null,
						runStartTime: null,
						runStartTimeAdjustment: null,
						runEndTime: null,
						executionOrder: null,
						lastRunSuccess: null
					}
				};
			} else {
				return undefined;
			}
		}).filter(edit => !!edit) as ICellEditOperation[];
		if (clearExecutionMetadataEdits.length) {
			context.notebookEditor.textModel.applyEdits(clearExecutionMetadataEdits, true, undefined, () => undefined, undefined);
		}
	}
});

registerAction2(class CenterActiveCellAction extends NotebookCellAction {
	constructor() {
		super({
			id: CENTER_ACTIVE_CELL,
			title: localize('notebookActions.centerActiveCell', "Center Active Cell"),
			keybinding: {
				when: NOTEBOOK_EDITOR_FOCUSED,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_L,
				mac: {
					primary: KeyMod.WinCtrl | KeyCode.KEY_L,
				},
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookCellActionContext): Promise<void> {
		return context.notebookEditor.revealInCenter(context.cell);
	}
});


registerAction2(class NotebookConfigureLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.notebook.layout.select',
			title: localize('workbench.notebook.layout.select.label', "Select between Notebook Layouts"),
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${OpenGettingStarted}`, true),
			category: NOTEBOOK_ACTIONS_CATEGORY,
			menu: [
				{
					id: MenuId.EditorTitle,
					group: 'notebookLayout',
					when: ContextKeyExpr.and(
						NOTEBOOK_IS_ACTIVE_EDITOR,
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true),
						ContextKeyExpr.equals(`config.${OpenGettingStarted}`, true)
					),
					order: 0
				},
				{
					id: MenuId.NotebookToolbar,
					group: 'notebookLayout',
					when: ContextKeyExpr.and(
						ContextKeyExpr.equals('config.notebook.globalToolbar', true),
						ContextKeyExpr.equals(`config.${OpenGettingStarted}`, true)
					),
					order: 0
				}
			]
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(ICommandService).executeCommand('workbench.action.openWalkthrough', { category: 'notebooks', step: 'notebookProfile' }, true);
	}
});

registerAction2(class NotebookConfigureLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.notebook.layout.configure',
			title: localize('workbench.notebook.layout.configure.label', "Customize Notebook Layout"),
			f1: true,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			menu: [
				{
					id: MenuId.NotebookToolbar,
					group: 'notebookLayout',
					when: ContextKeyExpr.equals('config.notebook.globalToolbar', true),
					order: 1
				}
			]
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:notebookLayout' });
	}
});

registerAction2(class NotebookConfigureLayoutFromEditorTitle extends Action2 {
	constructor() {
		super({
			id: 'workbench.notebook.layout.configure.editorTitle',
			title: localize('workbench.notebook.layout.configure.label', "Customize Notebook Layout"),
			f1: true,
			category: NOTEBOOK_ACTIONS_CATEGORY,
			menu: [
				{
					id: MenuId.NotebookEditorLayoutConfigure,
					group: 'notebookLayout',
					when: NOTEBOOK_IS_ACTIVE_EDITOR,
					order: 1
				}
			]
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: '@tag:notebookLayout' });
	}
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: MenuId.NotebookEditorLayoutConfigure,
	rememberDefaultAction: false,
	title: { value: localize('customizeNotebook', "Customize Notebook..."), original: 'Customize Notebook...', },
	icon: Codicon.settingsGear,
	group: 'navigation',
	order: -1,
	when: NOTEBOOK_IS_ACTIVE_EDITOR
});

registerAction2(class ToggleLineNumberFromEditorTitle extends Action2 {
	constructor() {
		super({
			id: 'notebook.toggleLineNumbersFromEditorTitle',
			title: { value: localize('notebook.toggleLineNumbers', "Toggle Notebook Line Numbers"), original: 'Toggle Notebook Line Numbers' },
			precondition: NOTEBOOK_EDITOR_FOCUSED,
			menu: [
				{
					id: MenuId.NotebookEditorLayoutConfigure,
					group: 'notebookLayoutDetails',
					order: 1,
					when: NOTEBOOK_IS_ACTIVE_EDITOR
				}],
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: true,
			toggled: {
				condition: ContextKeyExpr.notEquals('config.notebook.lineNumbers', 'off'),
				title: { value: localize('notebook.showLineNumbers', "Show Notebook Line Numbers"), original: 'Show Notebook Line Numbers' },
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ICommandService).executeCommand('notebook.toggleLineNumbers');
	}
});

registerAction2(class ToggleCellToolbarPositionFromEditorTitle extends Action2 {
	constructor() {
		super({
			id: 'notebook.toggleCellToolbarPositionFromEditorTitle',
			title: { value: localize('notebook.toggleCellToolbarPosition', "Toggle Cell Toolbar Position"), original: 'Toggle Cell Toolbar Position' },
			menu: [{
				id: MenuId.NotebookEditorLayoutConfigure,
				group: 'notebookLayoutDetails',
				order: 3
			}],
			category: NOTEBOOK_ACTIONS_CATEGORY,
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		return accessor.get(ICommandService).executeCommand('notebook.toggleCellToolbarPosition', ...args);
	}
});

registerAction2(class ToggleBreadcrumbFromEditorTitle extends Action2 {
	constructor() {
		super({
			id: 'breadcrumbs.toggleFromEditorTitle',
			title: { value: localize('notebook.toggleBreadcrumb', "Toggle Breadcrumbs"), original: 'Toggle Breadcrumbs' },
			menu: [{
				id: MenuId.NotebookEditorLayoutConfigure,
				group: 'notebookLayoutDetails',
				order: 2
			}],
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ICommandService).executeCommand('breadcrumbs.toggle');
	}
});

MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
	command: {
		id: 'breadcrumbs.toggle',
		title: { value: localize('cmd.toggle', "Toggle Breadcrumbs"), original: 'Toggle Breadcrumbs' },
	},
	group: 'notebookLayout',
	order: 2
});

CommandsRegistry.registerCommand('_resolveNotebookContentProvider', (accessor, args): {
	viewType: string;
	displayName: string;
	options: { transientOutputs: boolean; transientCellMetadata: TransientCellMetadata; transientDocumentMetadata: TransientDocumentMetadata; };
	filenamePattern: (string | glob.IRelativePattern | { include: string | glob.IRelativePattern, exclude: string | glob.IRelativePattern; })[];
}[] => {
	const notebookService = accessor.get<INotebookService>(INotebookService);
	const contentProviders = notebookService.getContributedNotebookTypes();
	return contentProviders.map(provider => {
		const filenamePatterns = provider.selectors.map(selector => {
			if (typeof selector === 'string') {
				return selector;
			}

			if (glob.isRelativePattern(selector)) {
				return selector;
			}

			if (isDocumentExcludePattern(selector)) {
				return {
					include: selector.include,
					exclude: selector.exclude
				};
			}

			return null;
		}).filter(pattern => pattern !== null) as (string | glob.IRelativePattern | { include: string | glob.IRelativePattern, exclude: string | glob.IRelativePattern; })[];

		return {
			viewType: provider.id,
			displayName: provider.displayName,
			filenamePattern: filenamePatterns,
			options: {
				transientCellMetadata: provider.options.transientCellMetadata,
				transientDocumentMetadata: provider.options.transientDocumentMetadata,
				transientOutputs: provider.options.transientOutputs
			}
		};
	});
});

CommandsRegistry.registerCommand('_resolveNotebookKernels', async (accessor, args: {
	viewType: string;
	uri: UriComponents;
}): Promise<{
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	preloads?: URI[];
}[]> => {
	const notebookKernelService = accessor.get(INotebookKernelService);
	const uri = URI.revive(args.uri as UriComponents);
	const kernels = notebookKernelService.getMatchingKernel({ uri, viewType: args.viewType });

	return kernels.all.map(provider => ({
		id: provider.id,
		label: provider.label,
		description: provider.description,
		detail: provider.detail,
		isPreferred: false, // todo@jrieken,@rebornix
		preloads: provider.preloadUris,
	}));
});