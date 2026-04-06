const canvas = document.getElementById("collage-canvas");
const ctx = canvas.getContext("2d");

const fileInput = document.getElementById("photo-input");
const addPhotoButton = document.getElementById("add-photo");
const clearPhotosButton = document.getElementById("clear-photos");
const photoList = document.getElementById("photo-list");

const widthInput = document.getElementById("canvas-width");
const heightInput = document.getElementById("canvas-height");
const canvasFormatSelect = document.getElementById("canvas-format");
const gridFlowSelect = document.getElementById("grid-flow");
const gridCountInput = document.getElementById("grid-count");
const filterModeSelect = document.getElementById("filter-mode");
const autoLayoutButton = document.getElementById("auto-layout");
const downloadButton = document.getElementById("download");
const fileNameInput = document.getElementById("file-name");

const emptyState = document.getElementById("empty-state");
const editorControls = document.getElementById("editor-controls");
const selectedLabel = document.getElementById("selected-label");
const widthRange = document.getElementById("width-range");
const heightRange = document.getElementById("height-range");
const xRange = document.getElementById("x-range");
const yRange = document.getElementById("y-range");
const fitModeSelect = document.getElementById("fit-mode");

const HANDLE_SIZE = 22;

const state = {
  items: [],
  selectedItemId: null,
  nextId: 1,
  drag: null
};

addPhotoButton.addEventListener("click", () => {
  fileInput.click();
});
fileInput.addEventListener("change", handleFilesSelected);
clearPhotosButton.addEventListener("click", clearPhotos);

autoLayoutButton.addEventListener("click", () => {
  rebuildLayout(true);
});
downloadButton.addEventListener("click", downloadCollage);

[widthInput, heightInput, gridCountInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input === widthInput || input === heightInput) {
      canvasFormatSelect.value = "custom";
    }
    rebuildLayout(false);
  });
});

[canvasFormatSelect, gridFlowSelect].forEach((input) => {
  input.addEventListener("input", applyCanvasSettings);
});

filterModeSelect.addEventListener("input", renderCollage);

[widthRange, heightRange, xRange, yRange, fitModeSelect].forEach((input) => {
  input.addEventListener("input", applyControlChanges);
});

canvas.addEventListener("pointerdown", handleCanvasPointerDown);
canvas.addEventListener("pointermove", handleCanvasPointerMove);
canvas.addEventListener("pointerup", endCanvasInteraction);
canvas.addEventListener("pointercancel", endCanvasInteraction);
canvas.addEventListener("mouseleave", () => {
  if (!state.drag) {
    canvas.style.cursor = "default";
  }
});

drawPlaceholder();
renderPhotoList();

async function handleFilesSelected(event) {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  fileInput.value = "";
  if (!files.length) {
    return;
  }

  const loadedItems = await Promise.all(files.map(loadImageFile));
  const appendedItems = loadedItems.map((item) => {
    const sequence = state.nextId++;
    return {
      ...item,
      id: `photo-${sequence}`,
      sequence,
      placement: createDefaultPlacement(),
      cache: {}
    };
  });

  state.items = sortPortraitFirst([...state.items, ...appendedItems]);
  selectItem(state.items[0]?.id ?? null);
  rebuildLayout(false);
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        name: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight,
        image
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load ${file.name}`));
    };

    image.src = objectUrl;
  });
}

function rebuildLayout(resetPlacement) {
  updateCanvasDimensions();
  state.items = sortPortraitFirst(state.items);

  if (resetPlacement) {
    state.items = state.items.map((item) => ({
      ...item,
      placement: createDefaultPlacement()
    }));
  }

  const visibleItems = getVisibleItems();
  if (state.selectedItemId && !visibleItems.some((item) => item.id === state.selectedItemId)) {
    state.selectedItemId = visibleItems[0]?.id ?? null;
  }

  renderPhotoList();
  syncEditor();

  if (!state.items.length) {
    drawPlaceholder();
    return;
  }

  renderCollage();
}

function updateCanvasDimensions() {
  const width = clamp(parseInt(widthInput.value, 10) || 1600, 600, 6000);
  const height = clamp(parseInt(heightInput.value, 10) || 2400, 600, 6000);
  canvas.width = width;
  canvas.height = height;
}

function renderCollage() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8f5ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tiles = getTiles();
  const visibleItems = getVisibleItems();
  const selectedIndex = getSelectedVisibleIndex();

  tiles.forEach((tile, index) => {
    const item = visibleItems[index];
    if (item) {
      drawImageInTile(item, tile);
    } else {
      drawEmptyTile(tile);
    }

    if (index === selectedIndex && item) {
      drawSelectedTile(tile);
    }
  });
}

function drawImageInTile(item, tile) {
  const image = getProcessedImage(item);
  const metrics = getImageMetrics(image, item.placement, tile);

  ctx.save();
  ctx.beginPath();
  ctx.rect(tile.x, tile.y, tile.width, tile.height);
  ctx.clip();
  ctx.drawImage(image, metrics.dx, metrics.dy, metrics.scaledWidth, metrics.scaledHeight);
  ctx.restore();
}

function drawEmptyTile(tile) {
  ctx.save();
  ctx.strokeStyle = "rgba(111, 117, 136, 0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(tile.x, tile.y, tile.width, tile.height);
  ctx.restore();
}

function drawSelectedTile(tile) {
  const handleRect = getHandleRect(tile);

  ctx.save();
  ctx.strokeStyle = "rgba(111, 75, 242, 0.95)";
  ctx.lineWidth = Math.max(canvas.width / 320, 2);
  ctx.strokeRect(tile.x, tile.y, tile.width, tile.height);

  ctx.fillStyle = "#6f4bf2";
  ctx.fillRect(handleRect.x, handleRect.y, handleRect.width, handleRect.height);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(handleRect.x + handleRect.width / 2, handleRect.y + 5);
  ctx.lineTo(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height - 5);
  ctx.moveTo(handleRect.x + 5, handleRect.y + handleRect.height / 2);
  ctx.lineTo(handleRect.x + handleRect.width - 5, handleRect.y + handleRect.height / 2);
  ctx.stroke();
  ctx.restore();
}

function getTiles() {
  const gridCount = getGridCount();
  const flow = gridFlowSelect.value;
  const columns = flow === "horizontal" ? gridCount : 1;
  const rows = flow === "horizontal" ? 1 : gridCount;
  const tileWidth = canvas.width / columns;
  const tileHeight = canvas.height / rows;
  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        x: column * tileWidth,
        y: row * tileHeight,
        width: tileWidth,
        height: tileHeight
      });
    }
  }

  return tiles;
}

function getGridCount() {
  return clamp(parseInt(gridCountInput.value, 10) || 1, 1, 12);
}

function getVisibleItems() {
  return state.items.slice(0, getGridCount());
}

function getSelectedVisibleIndex() {
  return getVisibleItems().findIndex((item) => item.id === state.selectedItemId);
}

function getSelectedItem() {
  return getVisibleItems().find((item) => item.id === state.selectedItemId) ?? null;
}

function handleCanvasPointerDown(event) {
  if (!state.items.length) {
    return;
  }

  const point = getCanvasPoint(event);
  const hit = getTileAtPoint(point.x, point.y);

  if (!hit) {
    selectItem(null);
    renderPhotoList();
    syncEditor();
    renderCollage();
    return;
  }

  selectItem(hit.item.id);
  renderPhotoList();
  syncEditor();

  const pointerMode = isPointInRect(point, getHandleRect(hit.tile)) ? "resize" : "move";
  const image = getProcessedImage(hit.item);
  const metrics = getImageMetrics(image, hit.item.placement, hit.tile);

  state.drag = {
    pointerId: event.pointerId,
    mode: pointerMode,
    tile: hit.tile,
    startX: point.x,
    startY: point.y,
    startOffsetX: hit.item.placement.offsetX,
    startOffsetY: hit.item.placement.offsetY,
    startScaleX: hit.item.placement.scaleX,
    startScaleY: hit.item.placement.scaleY,
    baseWidth: metrics.baseWidth,
    baseHeight: metrics.baseHeight
  };

  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = pointerMode === "resize" ? "nwse-resize" : "grabbing";
  renderCollage();
}

function handleCanvasPointerMove(event) {
  const point = getCanvasPoint(event);

  if (!state.drag) {
    updateCanvasCursor(point);
    return;
  }

  if (event.pointerId !== state.drag.pointerId) {
    return;
  }

  const selectedItem = getSelectedItem();
  if (!selectedItem) {
    endCanvasInteraction(event);
    return;
  }

  const deltaX = point.x - state.drag.startX;
  const deltaY = point.y - state.drag.startY;

  if (state.drag.mode === "move") {
    const image = getProcessedImage(selectedItem);
    const metrics = getImageMetrics(image, selectedItem.placement, state.drag.tile);

    selectedItem.placement.offsetX = metrics.maxShiftX > 0
      ? clamp(state.drag.startOffsetX + (deltaX / metrics.maxShiftX), -1, 1)
      : 0;
    selectedItem.placement.offsetY = metrics.maxShiftY > 0
      ? clamp(state.drag.startOffsetY + (deltaY / metrics.maxShiftY), -1, 1)
      : 0;
  } else {
    selectedItem.placement.scaleX = clamp(state.drag.startScaleX + (deltaX / Math.max(state.drag.baseWidth, 1)), 0.4, 4);
    selectedItem.placement.scaleY = clamp(state.drag.startScaleY + (deltaY / Math.max(state.drag.baseHeight, 1)), 0.4, 4);
  }

  syncEditor();
  renderCollage();
}

function endCanvasInteraction(event) {
  if (state.drag && event.pointerId === state.drag.pointerId) {
    canvas.releasePointerCapture(event.pointerId);
  }

  state.drag = null;
  updateCanvasCursor(getCanvasPoint(event));
}

function updateCanvasCursor(point) {
  const hit = getTileAtPoint(point.x, point.y);
  const selectedIndex = getSelectedVisibleIndex();

  if (!hit) {
    canvas.style.cursor = "default";
    return;
  }

  if (hit.index === selectedIndex) {
    canvas.style.cursor = isPointInRect(point, getHandleRect(hit.tile)) ? "nwse-resize" : "grab";
    return;
  }

  canvas.style.cursor = "pointer";
}

function getTileAtPoint(x, y) {
  const tiles = getTiles();
  const visibleItems = getVisibleItems();
  const index = tiles.findIndex((tile, tileIndex) => {
    if (!visibleItems[tileIndex]) {
      return false;
    }

    return x >= tile.x && x <= tile.x + tile.width && y >= tile.y && y <= tile.y + tile.height;
  });

  if (index === -1) {
    return null;
  }

  return {
    index,
    tile: tiles[index],
    item: visibleItems[index]
  };
}

function getCanvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return {
    x: (event.clientX - bounds.left) * scaleX,
    y: (event.clientY - bounds.top) * scaleY
  };
}

function getHandleRect(tile) {
  const size = Math.min(HANDLE_SIZE * (canvas.width / 1600), tile.width / 5, tile.height / 5);
  return {
    x: tile.x + tile.width - size,
    y: tile.y + tile.height - size,
    width: size,
    height: size
  };
}

function isPointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function syncEditor() {
  const selectedItem = getSelectedItem();
  const hasSelection = Boolean(selectedItem);
  emptyState.classList.toggle("hidden", hasSelection);
  editorControls.classList.toggle("hidden", !hasSelection);

  if (!hasSelection) {
    return;
  }

  const index = getSelectedVisibleIndex();
  selectedLabel.textContent = `Editing grid ${index + 1}: ${selectedItem.name}`;
  widthRange.value = selectedItem.placement.scaleX;
  heightRange.value = selectedItem.placement.scaleY;
  xRange.value = selectedItem.placement.offsetX;
  yRange.value = selectedItem.placement.offsetY;
  fitModeSelect.value = selectedItem.placement.fitMode;
}

function applyControlChanges() {
  const selectedItem = getSelectedItem();
  if (!selectedItem) {
    return;
  }

  selectedItem.placement.scaleX = parseFloat(widthRange.value);
  selectedItem.placement.scaleY = parseFloat(heightRange.value);
  selectedItem.placement.offsetX = parseFloat(xRange.value);
  selectedItem.placement.offsetY = parseFloat(yRange.value);
  selectedItem.placement.fitMode = fitModeSelect.value;
  renderCollage();
}

function drawPlaceholder() {
  updateCanvasDimensions();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8f5ef";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#676c7b";
  ctx.font = `${Math.max(22, canvas.width / 28)}px "Trebuchet MS", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Add photos to build your collage", canvas.width / 2, canvas.height / 2);
}

function downloadCollage() {
  if (!state.items.length) {
    return;
  }

  renderCollage();

  const link = document.createElement("a");

  // 1. Get user input
  let fileName = fileNameInput.value.trim();

  // 2. Remove invalid characters
  fileName = fileName.replace(/[<>:"/\\|?*]+/g, "");

  fileName = fileName.replace(/\s+/g, "-");
  
  // 3. If empty → default + timestamp
  if (!fileName) {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .slice(0, 19)
      .replace("T", "-")
      .replace(/:/g, "-");

    fileName = `${filterModeSelect.value}-collage-${timestamp}`;
  }

  // 4. Download
  link.download = `${fileName}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.95);
  link.click();
}

function applyCanvasSettings() {
  if (canvasFormatSelect.value === "portrait") {
    widthInput.value = "1600";
    heightInput.value = "2400";
  } else if (canvasFormatSelect.value === "landscape") {
    widthInput.value = "2400";
    heightInput.value = "1600";
  }

  rebuildLayout(false);
}

function renderPhotoList() {
  if (!state.items.length) {
    photoList.innerHTML = '<p class="empty-list">No photos added yet.</p>';
    return;
  }

  const visibleIds = new Set(getVisibleItems().map((item) => item.id));
  photoList.innerHTML = state.items
    .map((item, index) => `
      <div class="photo-item ${item.id === state.selectedItemId ? "selected" : ""} ${visibleIds.has(item.id) ? "" : "waiting"}" data-photo-id="${item.id}">
        <div class="photo-meta">
          <span class="photo-name">${escapeHtml(item.name)}</span>
          <span class="photo-shape">${item.height >= item.width ? "Portrait" : "Landscape"} photo - queue ${index + 1}</span>
          <span class="photo-status">${visibleIds.has(item.id) ? "In grid" : "Waiting"}</span>
        </div>
        <button type="button" class="secondary remove-photo" data-photo-id="${item.id}">Remove</button>
      </div>
    `)
    .join("");

  photoList.querySelectorAll(".photo-item").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest(".remove-photo")) {
        return;
      }

      toggleSelectionFromList(element.dataset.photoId);
    });
  });

  photoList.querySelectorAll(".remove-photo").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removePhoto(button.dataset.photoId);
    });
  });
}

function toggleSelectionFromList(photoId) {
  if (state.selectedItemId === photoId) {
    selectItem(null);
    renderPhotoList();
    syncEditor();
    renderCollageOrPlaceholder();
    return;
  }

  const selectedIndex = state.items.findIndex((item) => item.id === photoId);
  if (selectedIndex >= getGridCount()) {
    gridCountInput.value = selectedIndex + 1;
  }

  selectItem(photoId);
  rebuildLayout(false);
}

function selectItem(photoId) {
  state.selectedItemId = photoId;
}

function removePhoto(photoId) {
  state.items = state.items.filter((item) => item.id !== photoId);

  if (state.selectedItemId === photoId) {
    state.selectedItemId = state.items[0]?.id ?? null;
  }

  if (!state.items.length) {
    clearPhotos();
    return;
  }

  rebuildLayout(false);
}

function clearPhotos() {
  state.items = [];
  state.selectedItemId = null;
  state.drag = null;
  renderPhotoList();
  syncEditor();
  drawPlaceholder();
  canvas.style.cursor = "default";
}

function renderCollageOrPlaceholder() {
  if (!state.items.length) {
    drawPlaceholder();
    return;
  }

  renderCollage();
}

function sortPortraitFirst(items) {
  return [...items].sort((a, b) => {
    const portraitRankA = a.height >= a.width ? 0 : 1;
    const portraitRankB = b.height >= b.width ? 0 : 1;

    if (portraitRankA !== portraitRankB) {
      return portraitRankA - portraitRankB;
    }

    const aspectA = a.height / a.width;
    const aspectB = b.height / b.width;

    if (aspectA !== aspectB) {
      return aspectB - aspectA;
    }

    return a.sequence - b.sequence;
  });
}

function createDefaultPlacement() {
  return {
    scaleX: 1.2,
    scaleY: 1.2,
    offsetX: 0,
    offsetY: 0,
    fitMode: "cover"
  };
}

function getProcessedImage(item) {
  const mode = filterModeSelect.value;
  if (!item.cache[mode]) {
    item.cache[mode] = renderFilteredImage(item.image, mode);
  }
  return item.cache[mode];
}

function renderFilteredImage(image, mode) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.naturalWidth;
  offscreen.height = image.naturalHeight;
  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.drawImage(image, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const grey = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const transformed = transformGreyValue(grey, mode);
    data[i] = transformed;
    data[i + 1] = transformed;
    data[i + 2] = transformed;
  }

  offscreenCtx.putImageData(imageData, 0, 0);
  return offscreen;
}

function transformGreyValue(grey, mode) {
  if (mode === "soft-grey") {
    return clamp(Math.round(grey * 0.75 + 28), 0, 255);
  }

  if (mode === "contrast-grey") {
    return clamp(Math.round((grey - 128) * 1.45 + 128), 0, 255);
  }

  if (mode === "bw") {
    return grey >= 128 ? 255 : 0;
  }

  if (mode === "ink-bw") {
    return grey >= 155 ? 255 : 0;
  }

  return grey;
}

function getImageMetrics(image, placement, tile) {
  const fitRatio = placement.fitMode === "contain"
    ? Math.min(tile.width / image.width, tile.height / image.height)
    : Math.max(tile.width / image.width, tile.height / image.height);

  const baseWidth = image.width * fitRatio;
  const baseHeight = image.height * fitRatio;
  const scaledWidth = baseWidth * placement.scaleX;
  const scaledHeight = baseHeight * placement.scaleY;
  const maxShiftX = Math.max(0, (scaledWidth - tile.width) / 2);
  const maxShiftY = Math.max(0, (scaledHeight - tile.height) / 2);

  return {
    baseWidth,
    baseHeight,
    scaledWidth,
    scaledHeight,
    maxShiftX,
    maxShiftY,
    dx: tile.x + (tile.width - scaledWidth) / 2 + maxShiftX * placement.offsetX,
    dy: tile.y + (tile.height - scaledHeight) / 2 + maxShiftY * placement.offsetY
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
