const startView = document.getElementById('start-view');
const readerView = document.getElementById('reader-view');

const openFolderButton = document.getElementById('open-folder-button');
const changeFolderButton = document.getElementById('change-folder-button');
const refreshTreeButton = document.getElementById('refresh-tree-button');
const recentFoldersList = document.getElementById('recent-folders');
const recentEmpty = document.getElementById('recent-empty');
const currentRootLabel = document.getElementById('current-root');
const treeRoot = document.getElementById('tree-root');
const markdownView = document.getElementById('markdown-view');
const markdownEditor = document.getElementById('markdown-editor');
const toggleEditorButton = document.getElementById('toggle-editor-button');
const saveFileButton = document.getElementById('save-file-button');
const fileStatus = document.getElementById('file-status');
const themeButtons = document.querySelectorAll('.theme-toggle');

const state = {
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

function renderStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.dataset.icon;
    node.innerHTML = window.localmd.icon(name, iconAttrs);
  });
}

function showStartView() {
  startView.classList.remove('hidden');
  readerView.classList.add('hidden');
}

function showReaderView() {
  startView.classList.add('hidden');
  readerView.classList.remove('hidden');
}

function setMarkdownPlaceholder(text) {
  markdownView.innerHTML = '';
  const placeholder = document.createElement('p');
  placeholder.className = 'placeholder';
  placeholder.textContent = text;
  markdownView.appendChild(placeholder);
}

function fileNameFromPath(pathValue) {
  const segments = pathValue.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] || pathValue;
}

function applyTheme(theme) {
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
      <span class="theme-toggle-track" aria-hidden="true">
        <span class="theme-toggle-thumb"></span>
      </span>
      <span class="theme-glyph theme-glyph-right" aria-hidden="true">${window.localmd.icon('moon', iconAttrs)}</span>
    `;
  });
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function initializeTheme() {
  const storedTheme = window.localStorage.getItem('localmd-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);
}

function renderMarkdown() {
  if (!state.selectedFilePath) {
    setMarkdownPlaceholder('Select a markdown file to preview it.');
    return;
  }

  markdownView.innerHTML = window.localmd.renderMarkdown(state.currentMarkdown);
}

function updateFileStatus() {
  if (!state.selectedFilePath) {
    fileStatus.textContent = 'No file selected';
    return;
  }

  const suffix = state.isDirty ? ' (unsaved)' : '';
  fileStatus.textContent = `${fileNameFromPath(state.selectedFilePath)}${suffix}`;
}

function updateEditorUi() {
  const hasFile = Boolean(state.selectedFilePath);

  toggleEditorButton.disabled = !hasFile;
  toggleEditorButton.setAttribute('title', state.isEditing ? 'Preview mode' : 'Edit mode');
  toggleEditorButton.setAttribute('aria-label', state.isEditing ? 'Preview mode' : 'Edit mode');
  const iconTarget = toggleEditorButton.querySelector('.icon-glyph');
  if (iconTarget) {
    iconTarget.innerHTML = window.localmd.icon(state.isEditing ? 'eye' : 'edit-3', iconAttrs);
  }
  saveFileButton.disabled = !hasFile || !state.isDirty;
  saveFileButton.classList.toggle('hidden', !state.isEditing);

  markdownEditor.classList.toggle('hidden', !state.isEditing);
  markdownView.classList.toggle('hidden', state.isEditing);

  updateFileStatus();
}

function resetEditorState() {
  state.selectedFilePath = null;
  state.savedMarkdown = '';
  state.currentMarkdown = '';
  state.isEditing = false;
  state.isDirty = false;

  markdownEditor.value = '';
  setMarkdownPlaceholder('Select a markdown file to preview it.');
  updateEditorUi();
}

function confirmDiscardIfDirty() {
  if (!state.isDirty) {
    return true;
  }

  return window.confirm('You have unsaved changes. Discard them?');
}

async function renderRecentFolders() {
  const recents = await window.localmd.getRecentFolders();
  recentFoldersList.innerHTML = '';

  if (!recents.length) {
    recentEmpty.classList.remove('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');

  for (const folderPath of recents) {
    const li = document.createElement('li');

    const button = document.createElement('button');
    button.className = 'recent-item';

    const folderName = document.createElement('span');
    folderName.className = 'recent-name';
    folderName.textContent = fileNameFromPath(folderPath);

    const fullPath = document.createElement('span');
    fullPath.className = 'recent-path';
    fullPath.textContent = folderPath;

    button.append(folderName, fullPath);
    button.addEventListener('click', () => {
      loadFolder(folderPath);
    });

    li.appendChild(button);
    recentFoldersList.appendChild(li);
  }
}

async function pickFolder() {
  const result = await window.localmd.openFolderDialog();
  await renderRecentFolders();
  if (result.folderPath) {
    await loadFolder(result.folderPath);
  }
}

async function openPathTarget(targetPath, options = {}) {
  if (!targetPath) {
    return;
  }

  const { skipConfirm = false } = options;
  if (!skipConfirm && !confirmDiscardIfDirty()) {
    return;
  }

  const details = await window.localmd.inspectPath(targetPath);
  if (!details || details.kind === 'unsupported') {
    window.alert('Only markdown files and folders are supported.');
    return;
  }

  if (details.kind === 'directory') {
    await loadFolder(details.path, { skipConfirm: true });
    return;
  }

  if (details.kind === 'markdown_file') {
    if (state.currentRoot !== details.parentDir) {
      await loadFolder(details.parentDir, { skipConfirm: true });
    }
    await openMarkdownFile(details.path, { skipConfirm: true });
  }
}

function clearTree() {
  treeRoot.innerHTML = '';
}

async function rebuildTree() {
  if (!state.currentRoot) {
    return;
  }

  state.loadedDirectories.clear();
  state.expandedDirectories.add(state.currentRoot);
  clearTree();

  const rootEntry = {
    name: fileNameFromPath(state.currentRoot),
    path: state.currentRoot,
    type: 'directory'
  };

  const rootNode = await createDirectoryNode(rootEntry, 0, true);
  treeRoot.appendChild(rootNode);

  if (state.selectedFilePath) {
    setActiveFile(state.selectedFilePath);
  }
}

async function loadFolder(folderPath, options = {}) {
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

function setActiveFile(filePath) {
  state.selectedFilePath = filePath;
  document.querySelectorAll('.tree-item.file.selected').forEach((node) => {
    node.classList.remove('selected');
  });
  const active = document.querySelector(`[data-path="${CSS.escape(filePath)}"]`);
  if (active) {
    active.classList.add('selected');
  }
}

async function openMarkdownFile(filePath, options = {}) {
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
    setMarkdownPlaceholder(`Could not open file: ${error.message}`);
  }
}

async function saveCurrentFile() {
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
    window.alert(`Could not save file: ${error.message}`);
  }
}

function toggleEditorMode() {
  if (!state.selectedFilePath) {
    return;
  }

  state.isEditing = !state.isEditing;
  if (!state.isEditing) {
    renderMarkdown();
  }
  updateEditorUi();
}

function createFileNode(entry, depth) {
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
  node.addEventListener('click', () => openMarkdownFile(entry.path));
  return node;
}

async function fetchDirectoryContents(dirPath) {
  if (!state.loadedDirectories.has(dirPath)) {
    const rows = await window.localmd.readDirectory(dirPath);
    state.loadedDirectories.set(dirPath, rows);
  }
  return state.loadedDirectories.get(dirPath) || [];
}

function buildDirectoryRow(entry, depth, expanded) {
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

async function createDirectoryNode(entry, depth, isRoot = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-group';

  const expanded = state.expandedDirectories.has(entry.path);
  const row = buildDirectoryRow(entry, depth, expanded);
  wrapper.appendChild(row);

  const children = document.createElement('div');
  children.className = `tree-children${expanded ? '' : ' hidden'}`;
  wrapper.appendChild(children);

  row.addEventListener('click', async () => {
    const isExpanded = state.expandedDirectories.has(entry.path);
    if (isExpanded) {
      state.expandedDirectories.delete(entry.path);
      row.querySelector('.chevron').classList.remove('expanded');
      children.classList.add('hidden');
      return;
    }

    state.expandedDirectories.add(entry.path);
    row.querySelector('.chevron').classList.add('expanded');
    children.classList.remove('hidden');

    if (!children.hasChildNodes()) {
      await populateChildren(entry.path, children, depth + 1);
    }
  });

  if (expanded || isRoot) {
    await populateChildren(entry.path, children, depth + 1);
  }

  return wrapper;
}

async function populateChildren(dirPath, container, depth) {
  container.innerHTML = '';

  try {
    const rows = await fetchDirectoryContents(dirPath);

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'tree-empty';
      empty.textContent = 'No markdown files in this folder.';
      empty.style.paddingLeft = `${8 + depth * 14}px`;
      container.appendChild(empty);
      return;
    }

    for (const entry of rows) {
      if (entry.type === 'directory') {
        const dirNode = await createDirectoryNode(entry, depth);
        container.appendChild(dirNode);
      } else {
        container.appendChild(createFileNode(entry, depth));
      }
    }
  } catch (error) {
    const errorNode = document.createElement('p');
    errorNode.className = 'tree-empty';
    errorNode.textContent = `Could not read folder: ${error.message}`;
    errorNode.style.paddingLeft = `${8 + depth * 14}px`;
    container.appendChild(errorNode);
  }
}

openFolderButton.addEventListener('click', pickFolder);
changeFolderButton.addEventListener('click', pickFolder);
refreshTreeButton.addEventListener('click', rebuildTree);
toggleEditorButton.addEventListener('click', toggleEditorMode);
saveFileButton.addEventListener('click', saveCurrentFile);
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
    saveCurrentFile();
  }
});

function preventDropNavigation(event) {
  event.preventDefault();
}

async function extractDroppedPath(event) {
  const dt = event.dataTransfer;
  if (!dt) {
    return null;
  }

  const [file] = dt.files || [];
  if (!file) {
    return null;
  }

  if (typeof file.path === 'string' && file.path.length > 0) {
    return file.path;
  }

  const fallbackPath = window.localmd.getPathForFile(file);
  return typeof fallbackPath === 'string' && fallbackPath.length > 0 ? fallbackPath : null;
}

document.addEventListener('dragenter', preventDropNavigation, true);
document.addEventListener('dragover', preventDropNavigation, true);
document.addEventListener('drop', async (event) => {
  preventDropNavigation(event);

  const firstPath = await extractDroppedPath(event);
  if (!firstPath) return;

  try {
    await openPathTarget(firstPath);
  } catch (error) {
    window.alert(`Could not open dropped item: ${error.message}`);
  }
}, true);

window.localmd.onLaunchTarget(async (targetPath) => {
  try {
    await openPathTarget(targetPath);
  } catch (error) {
    window.alert(`Could not open target: ${error.message}`);
  }
});

initializeTheme();
renderStaticIcons();
renderRecentFolders().then(async () => {
  resetEditorState();
  showStartView();
  const startupTarget = await window.localmd.consumeLaunchTarget();
  if (startupTarget) {
    await openPathTarget(startupTarget, { skipConfirm: true });
  }
});
