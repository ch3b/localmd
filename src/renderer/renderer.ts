import type { InspectPathResult } from '../shared/api';

const startView = document.getElementById('start-view') as HTMLElement;
const readerView = document.getElementById('reader-view') as HTMLElement;

const openFolderButton = document.getElementById('open-folder-button') as HTMLButtonElement;
const changeFolderButton = document.getElementById('change-folder-button') as HTMLButtonElement;
const refreshTreeButton = document.getElementById('refresh-tree-button') as HTMLButtonElement;
const recentFoldersList = document.getElementById('recent-folders') as HTMLUListElement;
const recentEmpty = document.getElementById('recent-empty') as HTMLElement;
const currentRootLabel = document.getElementById('current-root') as HTMLElement;
const treeRoot = document.getElementById('tree-root') as HTMLElement;
const markdownView = document.getElementById('markdown-view') as HTMLElement;
const markdownEditor = document.getElementById('markdown-editor') as HTMLTextAreaElement;
const toggleEditorButton = document.getElementById('toggle-editor-button') as HTMLButtonElement;
const saveFileButton = document.getElementById('save-file-button') as HTMLButtonElement;
const fileStatus = document.getElementById('file-status') as HTMLElement;
const themeButtons = document.querySelectorAll<HTMLButtonElement>('.theme-toggle');

interface AppState {
  currentRoot: string | null;
  expandedDirectories: Set<string>;
  loadedDirectories: Map<string, { name: string; path: string; type: 'directory' | 'file' }[]>;
  selectedFilePath: string | null;
  savedMarkdown: string;
  currentMarkdown: string;
  isEditing: boolean;
  isDirty: boolean;
  theme: 'light' | 'dark';
}

const state: AppState = {
  currentRoot: null,
  expandedDirectories: new Set(),
  loadedDirectories: new Map(),
  selectedFilePath: null,
  savedMarkdown: '',
  currentMarkdown: '',
  isEditing: false,
  isDirty: false,
  theme: 'light'
};

const iconAttrs = {
  width: 16,
  height: 16,
  stroke: 'currentColor',
  'stroke-width': 1.9
};

function showStartView(): void {
  startView.classList.remove('hidden');
  readerView.classList.add('hidden');
}

function showReaderView(): void {
  startView.classList.add('hidden');
  readerView.classList.remove('hidden');
}

function setMarkdownPlaceholder(text: string): void {
  markdownView.innerHTML = '';
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = text;
  markdownView.appendChild(placeholder);
}

function fileNameFromPath(pathValue: string): string {
  const segments = pathValue.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] || pathValue;
}

function renderStaticIcons(): void {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    const name = node.dataset.icon;
    if (!name) return;
    node.innerHTML = window.localmd.icon(name, iconAttrs);
  });
}

function applyTheme(theme: 'light' | 'dark'): void {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem('localmd-theme', theme);

  themeButtons.forEach((button) => {
    button.dataset.theme = theme;
    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    button.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.innerHTML = `
      <span class="theme-glyph theme-glyph-left" aria-hidden="true">${window.localmd.icon('sun', iconAttrs)}</span>
      <span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-thumb"></span></span>
      <span class="theme-glyph theme-glyph-right" aria-hidden="true">${window.localmd.icon('moon', iconAttrs)}</span>
    `;
  });
}

function initializeTheme(): void {
  const storedTheme = window.localStorage.getItem('localmd-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme: 'light' | 'dark' =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : prefersDark
        ? 'dark'
        : 'light';
  applyTheme(initialTheme);
}

function toggleTheme(): void {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function renderMarkdown(): void {
  if (!state.selectedFilePath) {
    setMarkdownPlaceholder('Select a markdown file to preview it.');
    return;
  }

  markdownView.innerHTML = window.localmd.renderMarkdown(state.currentMarkdown);
}

function updateFileStatus(): void {
  if (!state.selectedFilePath) {
    fileStatus.textContent = 'No file selected';
    return;
  }

  fileStatus.textContent = `${fileNameFromPath(state.selectedFilePath)}${state.isDirty ? ' (unsaved)' : ''}`;
}

function updateEditorUi(): void {
  const hasFile = Boolean(state.selectedFilePath);

  toggleEditorButton.disabled = !hasFile;
  toggleEditorButton.setAttribute('title', state.isEditing ? 'Preview mode' : 'Edit mode');
  toggleEditorButton.setAttribute('aria-label', state.isEditing ? 'Preview mode' : 'Edit mode');
  const iconTarget = toggleEditorButton.querySelector<HTMLElement>('.icon-glyph');
  if (iconTarget) {
    iconTarget.innerHTML = window.localmd.icon(state.isEditing ? 'eye' : 'edit-3', iconAttrs);
  }

  saveFileButton.disabled = !hasFile || !state.isDirty;
  saveFileButton.classList.toggle('hidden', !state.isEditing);

  markdownEditor.classList.toggle('hidden', !state.isEditing);
  markdownView.classList.toggle('hidden', state.isEditing);

  updateFileStatus();
}

function resetEditorState(): void {
  state.selectedFilePath = null;
  state.savedMarkdown = '';
  state.currentMarkdown = '';
  state.isEditing = false;
  state.isDirty = false;

  markdownEditor.value = '';
  setMarkdownPlaceholder('Select a markdown file to preview it.');
  updateEditorUi();
}

function confirmDiscardIfDirty(): boolean {
  if (!state.isDirty) {
    return true;
  }

  return window.confirm('You have unsaved changes. Discard them?');
}

function setActiveFile(filePath: string): void {
  state.selectedFilePath = filePath;
  document.querySelectorAll('.tree-item.file.selected').forEach((node) => node.classList.remove('selected'));
  const active = document.querySelector<HTMLElement>(`.tree-item.file[data-path="${CSS.escape(filePath)}"]`);
  if (active) {
    active.classList.add('selected');
  }
}

async function renderRecentFolders(): Promise<void> {
  const recents = await window.localmd.getRecentFolders();
  recentFoldersList.innerHTML = '';

  if (recents.length === 0) {
    recentEmpty.classList.remove('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');

  for (const folderPath of recents) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'recent-item';

    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = fileNameFromPath(folderPath);

    const fullPath = document.createElement('span');
    fullPath.className = 'recent-path';
    fullPath.textContent = folderPath;

    button.append(name, fullPath);
    button.addEventListener('click', () => {
      void loadFolder(folderPath);
    });

    item.appendChild(button);
    recentFoldersList.appendChild(item);
  }
}

async function pickFolder(): Promise<void> {
  const result = await window.localmd.openFolderDialog();
  await renderRecentFolders();
  if (result.folderPath) {
    await loadFolder(result.folderPath);
  }
}

function clearTree(): void {
  treeRoot.innerHTML = '';
}

async function fetchDirectoryContents(dirPath: string): Promise<{ name: string; path: string; type: 'directory' | 'file' }[]> {
  if (!state.loadedDirectories.has(dirPath)) {
    state.loadedDirectories.set(dirPath, await window.localmd.readDirectory(dirPath));
  }
  return state.loadedDirectories.get(dirPath) ?? [];
}

function buildDirectoryRow(entry: { name: string; path: string }, depth: number, expanded: boolean): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'tree-item directory';
  row.dataset.path = entry.path;
  row.style.paddingLeft = `${8 + depth * 14}px`;

  const chevron = document.createElement('span');
  chevron.className = `chevron${expanded ? ' expanded' : ''}`;
  chevron.textContent = '▸';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = 'D';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = entry.name;

  row.append(chevron, icon, label);
  return row;
}

function createFileNode(entry: { name: string; path: string }, depth: number): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'tree-item file';
  node.dataset.path = entry.path;
  node.style.paddingLeft = `${12 + depth * 14}px`;

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = 'M';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = entry.name;

  node.append(icon, label);
  node.addEventListener('click', () => {
    void openMarkdownFile(entry.path);
  });

  return node;
}

async function populateChildren(dirPath: string, container: HTMLElement, depth: number): Promise<void> {
  container.innerHTML = '';

  try {
    const rows = await fetchDirectoryContents(dirPath);
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tree-empty';
      empty.textContent = 'No markdown files in this folder.';
      empty.style.paddingLeft = `${8 + depth * 14}px`;
      container.appendChild(empty);
      return;
    }

    for (const entry of rows) {
      if (entry.type === 'directory') {
        container.appendChild(await createDirectoryNode(entry, depth));
      } else {
        container.appendChild(createFileNode(entry, depth));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorNode = document.createElement('p');
    errorNode.className = 'tree-empty';
    errorNode.textContent = `Could not read folder: ${message}`;
    errorNode.style.paddingLeft = `${8 + depth * 14}px`;
    container.appendChild(errorNode);
  }
}

async function createDirectoryNode(entry: { name: string; path: string }, depth: number, isRoot = false): Promise<HTMLElement> {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-group';

  const expanded = state.expandedDirectories.has(entry.path);
  const row = buildDirectoryRow(entry, depth, expanded);
  wrapper.appendChild(row);

  const children = document.createElement('div');
  children.className = `tree-children${expanded ? '' : ' hidden'}`;
  wrapper.appendChild(children);

  row.addEventListener('click', () => {
    void (async () => {
      const isExpanded = state.expandedDirectories.has(entry.path);
      const chevron = row.querySelector<HTMLElement>('.chevron');
      if (!chevron) return;

      if (isExpanded) {
        state.expandedDirectories.delete(entry.path);
        chevron.classList.remove('expanded');
        children.classList.add('hidden');
        return;
      }

      state.expandedDirectories.add(entry.path);
      chevron.classList.add('expanded');
      children.classList.remove('hidden');

      if (!children.hasChildNodes()) {
        await populateChildren(entry.path, children, depth + 1);
      }
    })();
  });

  if (expanded || isRoot) {
    await populateChildren(entry.path, children, depth + 1);
  }

  return wrapper;
}

async function rebuildTree(): Promise<void> {
  if (!state.currentRoot) {
    return;
  }

  state.loadedDirectories.clear();
  state.expandedDirectories.add(state.currentRoot);
  clearTree();

  const rootNode = await createDirectoryNode(
    { name: fileNameFromPath(state.currentRoot), path: state.currentRoot },
    0,
    true
  );

  treeRoot.appendChild(rootNode);

  if (state.selectedFilePath) {
    setActiveFile(state.selectedFilePath);
  }
}

async function loadFolder(folderPath: string, options: { skipConfirm?: boolean } = {}): Promise<void> {
  const { skipConfirm = false } = options;
  if (!skipConfirm && !confirmDiscardIfDirty()) {
    return;
  }

  state.currentRoot = folderPath;
  state.expandedDirectories = new Set([folderPath]);

  currentRootLabel.textContent = folderPath;
  resetEditorState();
  showReaderView();
  await rebuildTree();
}

async function openMarkdownFile(filePath: string, options: { skipConfirm?: boolean } = {}): Promise<void> {
  const { skipConfirm = false } = options;
  if (!skipConfirm && state.selectedFilePath !== filePath && !confirmDiscardIfDirty()) {
    return;
  }

  try {
    const markdown = await window.localmd.readMarkdownFile(filePath);
    state.savedMarkdown = markdown;
    state.currentMarkdown = markdown;
    state.isDirty = false;
    state.isEditing = false;

    markdownEditor.value = markdown;
    setActiveFile(filePath);
    renderMarkdown();
    updateEditorUi();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setMarkdownPlaceholder(`Could not open file: ${message}`);
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!state.selectedFilePath || !state.isDirty) {
    return;
  }

  try {
    await window.localmd.writeMarkdownFile(state.selectedFilePath, state.currentMarkdown);
    state.savedMarkdown = state.currentMarkdown;
    state.isDirty = false;
    renderMarkdown();
    updateEditorUi();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    window.alert(`Could not save file: ${message}`);
  }
}

function toggleEditorMode(): void {
  if (!state.selectedFilePath) {
    return;
  }

  state.isEditing = !state.isEditing;
  if (!state.isEditing) {
    renderMarkdown();
  }
  updateEditorUi();
}

async function openPathTarget(targetPath: string | null, options: { skipConfirm?: boolean } = {}): Promise<void> {
  if (!targetPath) {
    return;
  }

  const { skipConfirm = false } = options;
  if (!skipConfirm && !confirmDiscardIfDirty()) {
    return;
  }

  const details: InspectPathResult = await window.localmd.inspectPath(targetPath);
  if (details.kind === 'unsupported') {
    window.alert('Only markdown files and folders are supported.');
    return;
  }

  if (details.kind === 'directory') {
    await loadFolder(details.path, { skipConfirm: true });
    return;
  }

  if (state.currentRoot !== details.parentDir) {
    await loadFolder(details.parentDir, { skipConfirm: true });
  }
  await openMarkdownFile(details.path, { skipConfirm: true });
}

function preventDropNavigation(event: DragEvent): void {
  event.preventDefault();
}

async function extractDroppedPath(event: DragEvent): Promise<string | null> {
  const dt = event.dataTransfer;
  if (!dt || dt.files.length === 0) {
    return null;
  }

  const [file] = dt.files;
  if (!file) {
    return null;
  }

  if ('path' in file && typeof (file as File & { path?: unknown }).path === 'string') {
    return (file as File & { path: string }).path;
  }

  const fallbackPath = window.localmd.getPathForFile(file);
  return fallbackPath || null;
}

function registerEventHandlers(): void {
  openFolderButton.addEventListener('click', () => {
    void pickFolder();
  });

  changeFolderButton.addEventListener('click', () => {
    void pickFolder();
  });

  refreshTreeButton.addEventListener('click', () => {
    void rebuildTree();
  });

  toggleEditorButton.addEventListener('click', toggleEditorMode);
  saveFileButton.addEventListener('click', () => {
    void saveCurrentFile();
  });

  themeButtons.forEach((button) => button.addEventListener('click', toggleTheme));

  markdownEditor.addEventListener('input', () => {
    state.currentMarkdown = markdownEditor.value;
    state.isDirty = state.currentMarkdown !== state.savedMarkdown;

    if (!state.isEditing) {
      renderMarkdown();
    }
    updateEditorUi();
  });

  window.addEventListener('keydown', (event) => {
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
    if (isSaveShortcut && state.isEditing) {
      event.preventDefault();
      void saveCurrentFile();
    }
  });

  document.addEventListener('dragenter', preventDropNavigation, true);
  document.addEventListener('dragover', preventDropNavigation, true);
  document.addEventListener('drop', (event) => {
    void (async () => {
      preventDropNavigation(event);
      const firstPath = await extractDroppedPath(event);
      if (!firstPath) {
        return;
      }

      try {
        await openPathTarget(firstPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        window.alert(`Could not open dropped item: ${message}`);
      }
    })();
  }, true);

  const unsubscribeLaunchTarget = window.localmd.onLaunchTarget((targetPath) => {
    void openPathTarget(targetPath).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      window.alert(`Could not open target: ${message}`);
    });
  });

  window.addEventListener('beforeunload', () => {
    unsubscribeLaunchTarget();
  });
}

async function bootstrapRenderer(): Promise<void> {
  initializeTheme();
  renderStaticIcons();
  registerEventHandlers();

  await renderRecentFolders();
  resetEditorState();
  showStartView();

  const startupTarget = await window.localmd.consumeLaunchTarget();
  if (startupTarget) {
    await openPathTarget(startupTarget, { skipConfirm: true });
  }
}

void bootstrapRenderer();
