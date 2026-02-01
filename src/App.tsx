import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import "./App.css";

interface ImageMetadata {
  genre: string;
  source: string;
  author: string;
}

interface ImageReference {
  folder: string;
  image: string;
}

interface MetadataGroups {
  genres: Record<string, ImageReference[]>;
  sources: Record<string, ImageReference[]>;
  authors: Record<string, ImageReference[]>;
}

function App() {
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [gridColumns, setGridColumns] = useState<number>(4);
  const [mainViewMode, setMainViewMode] = useState<"single" | "grid">("single");
  const [mainGridColumns, setMainGridColumns] = useState<number>(3);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [thumbnailPaths, setThumbnailPaths] = useState<Map<string, string>>(
    new Map(),
  );
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [isAutoAdvance, setIsAutoAdvance] = useState<boolean>(false);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState<number>(3);
  const [fullscreenDisplayMode, setFullscreenDisplayMode] = useState<
    "single" | "triple"
  >("single");
  const [isFullscreenUIVisible, setIsFullscreenUIVisible] =
    useState<boolean>(true);
  const hideUITimerRef = useRef<number | null>(null);
  const [currentMetadata, setCurrentMetadata] = useState<ImageMetadata | null>(
    null,
  );
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] =
    useState<boolean>(false);
  const [editingMetadata, setEditingMetadata] = useState<ImageMetadata>({
    genre: "",
    source: "",
    author: "",
  });
  const [browseMode, setBrowseMode] = useState<"folders" | "metadata">(
    "folders",
  );
  const [metadataGroups, setMetadataGroups] = useState<MetadataGroups | null>(
    null,
  );
  const [metadataField, setMetadataField] = useState<
    "genres" | "sources" | "authors"
  >("genres");
  const [selectedMetadataValue, setSelectedMetadataValue] =
    useState<string>("");
  const imageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isImageLoaded, setIsImageLoaded] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">("none");
  const [isAutoAdvanceReverse, setIsAutoAdvanceReverse] =
    useState<boolean>(false);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      loadImages(selectedFolder);
    }
  }, [selectedFolder]);

  useEffect(() => {
    if (selectedFolder && selectedImage) {
      setIsImageLoaded(false);
      loadImagePath(selectedFolder, selectedImage);
      loadMetadata(selectedFolder, selectedImage);
      setZoom(1);
      const index = images.indexOf(selectedImage);
      setCurrentImageIndex(index >= 0 ? index : 0);
    }
  }, [selectedFolder, selectedImage, images]);

  useEffect(() => {
    if (isFullscreen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeFullscreen();
        } else if (e.key === "ArrowLeft") {
          prevImage();
        } else if (e.key === "ArrowRight") {
          nextImage();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isFullscreen, currentImageIndex]);

  useEffect(() => {
    if (isFullscreen && isAutoAdvance) {
      const timer = setInterval(() => {
        if (currentImageIndex < images.length - 1) {
          nextImage();
        } else {
          setIsAutoAdvance(false);
        }
      }, autoAdvanceInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [
    isFullscreen,
    isAutoAdvance,
    currentImageIndex,
    autoAdvanceInterval,
    images.length,
  ]);

  useEffect(() => {
    if (isFullscreen && isAutoAdvanceReverse) {
      const timer = setInterval(() => {
        if (currentImageIndex > 0) {
          prevImage();
        } else {
          setIsAutoAdvanceReverse(false);
        }
      }, autoAdvanceInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [
    isFullscreen,
    isAutoAdvanceReverse,
    currentImageIndex,
    autoAdvanceInterval,
  ]);

  useEffect(() => {
    if (browseMode === "metadata") {
      loadMetadataGroups();
    }
  }, [browseMode]);

  useEffect(() => {
    if (browseMode === "metadata" && selectedMetadataValue && metadataGroups) {
      const fieldData = metadataGroups[metadataField];
      const imageRefs = fieldData[selectedMetadataValue] || [];
      loadImagesFromReferences(imageRefs);
    }
  }, [browseMode, selectedMetadataValue, metadataField]);

  useEffect(() => {
    if (isFullscreen) {
      const handleMouseMove = () => {
        setIsFullscreenUIVisible(true);
        if (hideUITimerRef.current) {
          clearTimeout(hideUITimerRef.current);
        }
        hideUITimerRef.current = window.setTimeout(() => {
          setIsFullscreenUIVisible(false);
        }, 3000);
      };

      window.addEventListener("mousemove", handleMouseMove);
      // 初期タイマー設定
      hideUITimerRef.current = window.setTimeout(() => {
        setIsFullscreenUIVisible(false);
      }, 3000);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        if (hideUITimerRef.current) {
          clearTimeout(hideUITimerRef.current);
        }
      };
    } else {
      setIsFullscreenUIVisible(true);
    }
  }, [isFullscreen]);

  async function loadFolders() {
    try {
      const folderList = await invoke<string[]>("get_image_folders");
      setFolders(folderList);
      if (folderList.length > 0) {
        setSelectedFolder(folderList[0]);
      }
    } catch (error) {
      console.error("Failed to load folders:", error);
    }
  }

  async function loadImages(folder: string) {
    try {
      const imageList = await invoke<string[]>("get_images_in_folder", {
        folder,
      });
      setImages(imageList);

      // Load thumbnail paths for grid view
      const newThumbnailPaths = new Map<string, string>();
      for (const image of imageList) {
        try {
          const path = await invoke<string>("get_image_path", {
            folder,
            image,
          });
          newThumbnailPaths.set(image, path);
        } catch (err) {
          console.error(`Failed to load path for ${image}:`, err);
        }
      }
      setThumbnailPaths(newThumbnailPaths);

      if (imageList.length > 0) {
        setSelectedImage(imageList[0]);
      } else {
        setSelectedImage("");
        setImagePath("");
      }
    } catch (error) {
      console.error("Failed to load images:", error);
    }
  }

  async function loadImagePath(folder: string, image: string) {
    try {
      const path = await invoke<string>("get_image_path", { folder, image });
      setImagePath(path);
    } catch (error) {
      console.error("Failed to load image path:", error);
    }
  }

  async function loadMetadata(folder: string, image: string) {
    try {
      const metadata = await invoke<ImageMetadata | null>(
        "load_image_metadata",
        { folder, image },
      );
      setCurrentMetadata(metadata);
    } catch (error) {
      console.error("Failed to load metadata:", error);
      setCurrentMetadata(null);
    }
  }

  async function saveMetadata() {
    if (!selectedFolder || !selectedImage) return;

    try {
      await invoke("save_image_metadata", {
        folder: selectedFolder,
        image: selectedImage,
        genre: editingMetadata.genre,
        source: editingMetadata.source,
        author: editingMetadata.author,
      });
      setCurrentMetadata({ ...editingMetadata });
      setIsMetadataEditorOpen(false);
      // Reload metadata groups if in metadata browse mode
      if (browseMode === "metadata") {
        loadMetadataGroups();
      }
    } catch (error) {
      console.error("Failed to save metadata:", error);
    }
  }

  async function loadMetadataGroups() {
    try {
      const groups = await invoke<MetadataGroups>("get_metadata_groups");
      setMetadataGroups(groups);
    } catch (error) {
      console.error("Failed to load metadata groups:", error);
    }
  }

  async function loadImagesFromReferences(refs: ImageReference[]) {
    const imageList = refs.map((ref) => ref.image);
    setImages(imageList);

    // Load thumbnail paths for all referenced images
    const newThumbnailPaths = new Map<string, string>();
    for (const ref of refs) {
      try {
        const path = await invoke<string>("get_image_path", {
          folder: ref.folder,
          image: ref.image,
        });
        newThumbnailPaths.set(ref.image, path);
      } catch (err) {
        console.error(`Failed to load path for ${ref.image}:`, err);
      }
    }
    setThumbnailPaths(newThumbnailPaths);

    if (refs.length > 0) {
      setSelectedFolder(refs[0].folder);
      setSelectedImage(refs[0].image);
    } else {
      setSelectedImage("");
      setImagePath("");
    }
  }

  function openMetadataEditor() {
    setEditingMetadata(
      currentMetadata || { genre: "", source: "", author: "" },
    );
    setIsMetadataEditorOpen(true);
  }

  function handleImageClick(image: string) {
    setSelectedImage(image);

    // Scroll to image in main grid if in grid mode
    if (mainViewMode === "grid") {
      setTimeout(() => {
        const imageElement = imageRefsMap.current.get(image);
        if (imageElement) {
          imageElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);
    }
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }

  function handleResetZoom() {
    setZoom(1);
  }

  function handleWheel(e: React.WheelEvent) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  }

  function openFullscreen(index: number) {
    setCurrentImageIndex(index);
    setIsFullscreen(true);
    setSelectedImage(images[index]);
  }

  function closeFullscreen() {
    setIsFullscreen(false);
    setZoom(1);
    setIsAutoAdvance(false);
    setIsAutoAdvanceReverse(false);
  }

  function nextImage() {
    if (currentImageIndex < images.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(images[newIndex]);
    }
  }

  function prevImage() {
    if (currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(images[newIndex]);
    }
  }

  function getSortedImages() {
    if (sortOrder === "none") {
      return images;
    }
    const sorted = [...images].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.localeCompare(b);
      } else {
        return b.localeCompare(a);
      }
    });
    return sorted;
  }

  function toggleSortOrder() {
    if (sortOrder === "none") {
      setSortOrder("asc");
    } else if (sortOrder === "asc") {
      setSortOrder("desc");
    } else {
      setSortOrder("none");
    }
  }

  return (
    <div className="app">
      {images.length > 0 && isHeaderVisible && (
        <div className="custom-titlebar" data-tauri-drag-region>
          <div className="titlebar-content">
            <div className="titlebar-controls">
              <div className="view-mode-toggle">
                <button
                  className={mainViewMode === "single" ? "active" : ""}
                  onClick={() => setMainViewMode("single")}
                  title="単一表示"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect
                      x="2"
                      y="2"
                      width="12"
                      height="12"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </button>
                <button
                  className={mainViewMode === "grid" ? "active" : ""}
                  onClick={() => setMainViewMode("grid")}
                  title="グリッド表示"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2H6V6H2V2ZM10 2H14V6H10V2ZM2 10H6V14H2V10ZM10 10H14V14H10V10Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              {mainViewMode === "grid" && (
                <div className="grid-size-control">
                  <div className="grid-size-buttons">
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.max(2, mainGridColumns - 1))
                      }
                      disabled={mainGridColumns <= 2}
                    >
                      &lt;
                    </button>
                    <span className="grid-count">{mainGridColumns}</span>
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.min(12, mainGridColumns + 1))
                      }
                      disabled={mainGridColumns >= 12}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
              <button
                className="toggle-titlebar-btn"
                onClick={() => setIsHeaderVisible(false)}
                title="タイトルバーを隠す"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 10L8 6L12 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {!isHeaderVisible && images.length > 0 && (
        <button
          className="show-titlebar-btn"
          onClick={() => setIsHeaderVisible(true)}
          title="タイトルバーを表示"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 12L10 7L15 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="app-main-container">
        {isSidebarVisible && (
          <div className="sidebar">
            <div className="browse-mode-selector">
              <div className="browse-mode-buttons">
                <button
                  className={browseMode === "folders" ? "active" : ""}
                  onClick={() => setBrowseMode("folders")}
                >
                  フォルダ別
                </button>
                <button
                  className={browseMode === "metadata" ? "active" : ""}
                  onClick={() => setBrowseMode("metadata")}
                >
                  タグ別
                </button>
              </div>
              <button
                className="toggle-sidebar-btn"
                onClick={() => setIsSidebarVisible(false)}
                title="サイドバーを隠す"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M10 4L6 8L10 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {browseMode === "folders" ? (
              <>
                <div className="folder-list">
                  <h3>Folders</h3>
                  {folders.map((folder) => (
                    <div
                      key={folder}
                      className={`folder-item ${selectedFolder === folder ? "selected" : ""}`}
                      onClick={() => setSelectedFolder(folder)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M2 4C2 2.89543 2.89543 2 4 2H6L7 4H12C13.1046 4 14 4.89543 14 6V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V4Z"
                          fill="currentColor"
                          opacity="0.3"
                        />
                      </svg>
                      {folder}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="metadata-browser">
                <div className="metadata-field-tabs">
                  <button
                    className={metadataField === "genres" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("genres");
                      setSelectedMetadataValue("");
                    }}
                  >
                    ジャンル
                  </button>
                  <button
                    className={metadataField === "sources" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("sources");
                      setSelectedMetadataValue("");
                    }}
                  >
                    元ネタ
                  </button>
                  <button
                    className={metadataField === "authors" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("authors");
                      setSelectedMetadataValue("");
                    }}
                  >
                    作者
                  </button>
                </div>
                <div className="metadata-values-list">
                  <h3>
                    {metadataField === "genres" && "ジャンル一覧"}
                    {metadataField === "sources" && "元ネタ一覧"}
                    {metadataField === "authors" && "作者一覧"}
                  </h3>
                  {metadataGroups &&
                    Object.keys(metadataGroups[metadataField]).length === 0 && (
                      <p className="no-metadata">データがありません</p>
                    )}
                  {metadataGroups &&
                    Object.entries(metadataGroups[metadataField]).map(
                      ([value, refs]) => (
                        <div
                          key={value}
                          className={`metadata-value-item ${selectedMetadataValue === value ? "selected" : ""}`}
                          onClick={() => setSelectedMetadataValue(value)}
                        >
                          <span className="value-name">{value}</span>
                          <span className="value-count">({refs.length})</span>
                        </div>
                      ),
                    )}
                </div>
              </div>
            )}
            <div className="view-controls">
              <div className="view-mode-toggle">
                <button
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                  title="リスト表示"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 4H14M2 8H14M2 12H14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => setViewMode("grid")}
                  title="グリッド表示"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2H6V6H2V2ZM10 2H14V6H10V2ZM2 10H6V14H2V10ZM10 10H14V14H10V10Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              {viewMode === "grid" && (
                <div className="grid-size-control">
                  <label>グリッド数</label>
                  <div className="grid-size-buttons">
                    <button
                      onClick={() =>
                        setGridColumns(Math.max(3, gridColumns - 1))
                      }
                      disabled={gridColumns <= 3}
                    >
                      &lt;
                    </button>
                    <span className="grid-count">{gridColumns}</span>
                    <button
                      onClick={() =>
                        setGridColumns(Math.min(6, gridColumns + 1))
                      }
                      disabled={gridColumns >= 6}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="image-list">
              <div className="image-list-header">
                <h3>画像一覧 ({images.length})</h3>
                <button
                  className={`sort-btn ${sortOrder !== "none" ? "active" : ""}`}
                  onClick={toggleSortOrder}
                  title={
                    sortOrder === "none"
                      ? "ソート: なし"
                      : sortOrder === "asc"
                        ? "ソート: A-Z"
                        : "ソート: Z-A"
                  }
                >
                  {sortOrder === "asc" && "A-Z"}
                  {sortOrder === "desc" && "Z-A"}
                  {sortOrder === "none" && "↑↓"}
                </button>
              </div>
              {images.length === 0 && selectedFolder && (
                <p className="no-images">画像がありません</p>
              )}
              {viewMode === "list" &&
                getSortedImages().map((image, _index) => (
                  <div
                    key={image}
                    className={`image-item ${selectedImage === image ? "selected" : ""}`}
                    onClick={() => handleImageClick(image)}
                  >
                    {image}
                  </div>
                ))}
              {viewMode === "grid" && (
                <div
                  className="image-grid"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
                >
                  {getSortedImages().map((image, _index) => {
                    const thumbPath = thumbnailPaths.get(image);
                    return (
                      <div
                        key={image}
                        className="grid-item"
                        onClick={() => handleImageClick(image)}
                        title={image}
                      >
                        <div className="grid-item-thumbnail">
                          {thumbPath ? (
                            <img src={convertFileSrc(thumbPath)} alt={image} />
                          ) : (
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M4 4H20V20H4V4Z"
                                stroke="currentColor"
                                strokeWidth="2"
                              />
                              <path
                                d="M4 16L8 12L12 16L16 12L20 16"
                                stroke="currentColor"
                                strokeWidth="2"
                              />
                            </svg>
                          )}
                        </div>
                        {/* <div className="grid-item-name">{image}</div> */}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {!isSidebarVisible && (
          <button
            className="show-sidebar-btn"
            onClick={() => setIsSidebarVisible(true)}
            title="サイドバーを表示"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M7 5L12 10L7 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div className="main-content" onWheel={handleWheel}>
          {mainViewMode === "single" && imagePath && (
            <div className="main-single-view">
              <div className="zoom-controls">
                <button
                  onClick={handleZoomOut}
                  title="縮小 (Ctrl + スクロール)"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button onClick={handleResetZoom} title="リセット">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 4V12M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button onClick={handleZoomIn} title="拡大 (Ctrl + スクロール)">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 4V12M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              {currentMetadata && (
                <div className="metadata-display">
                  <div className="metadata-item">
                    <strong>ジャンル:</strong> {currentMetadata.genre}
                  </div>
                  <div className="metadata-item">
                    <strong>元ネタ:</strong> {currentMetadata.source}
                  </div>
                  <div className="metadata-item">
                    <strong>作者:</strong> {currentMetadata.author}
                  </div>
                </div>
              )}
              <button
                className="edit-metadata-btn"
                onClick={openMetadataEditor}
                title="情報を編集"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="image-container">
                <img
                  src={convertFileSrc(imagePath)}
                  alt={selectedImage}
                  className={`main-image ${isImageLoaded ? "loaded" : ""}`}
                  style={{ transform: `scale(${zoom})`, cursor: "pointer" }}
                  onClick={() => openFullscreen(currentImageIndex)}
                  onLoad={() => setIsImageLoaded(true)}
                />
              </div>
            </div>
          )}
          {mainViewMode === "grid" && images.length > 0 && (
            <div className="main-grid-container">
              <div
                className="main-image-grid"
                style={{
                  gridTemplateColumns: `repeat(${mainGridColumns}, 1fr)`,
                }}
              >
                {images.map((image, index) => {
                  const thumbPath = thumbnailPaths.get(image);
                  return (
                    <div
                      key={image}
                      ref={(el) => {
                        if (el) {
                          imageRefsMap.current.set(image, el);
                        } else {
                          imageRefsMap.current.delete(image);
                        }
                      }}
                      className={`main-grid-item ${selectedImage === image ? "selected" : ""}`}
                      onClick={() => openFullscreen(index)}
                      title={image}
                    >
                      {thumbPath ? (
                        <img src={convertFileSrc(thumbPath)} alt={image} />
                      ) : (
                        <div className="placeholder">読込中...</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!imagePath && folders.length === 0 && (
            <div className="no-content">
              <p>~/.config/waifurary/images フォルダに画像を配置してください</p>
            </div>
          )}
          {!imagePath && folders.length > 0 && images.length === 0 && (
            <div className="no-content">
              <p>選択したフォルダに画像がありません</p>
            </div>
          )}
        </div>
      </div>
      {isFullscreen && (
        <div className="fullscreen-viewer" onClick={closeFullscreen}>
          <button
            className={`close-btn ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={closeFullscreen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            className={`auto-advance-controls ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`auto-advance-toggle reverse ${isAutoAdvanceReverse ? "active" : ""}`}
              onClick={() => {
                setIsAutoAdvanceReverse(!isAutoAdvanceReverse);
                if (!isAutoAdvanceReverse) setIsAutoAdvance(false);
              }}
              title={isAutoAdvanceReverse ? "逆再生を停止" : "逆再生を開始"}
            >
              {isAutoAdvanceReverse ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 5H8V15H6V5ZM12 5H14V15H12V5Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M14 4L5 10L14 16V4Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button
              className={`auto-advance-toggle ${isAutoAdvance ? "active" : ""}`}
              onClick={() => {
                setIsAutoAdvance(!isAutoAdvance);
                if (!isAutoAdvance) setIsAutoAdvanceReverse(false);
              }}
              title={isAutoAdvance ? "自動送りを停止" : "自動送りを開始"}
            >
              {isAutoAdvance ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 5H8V15H6V5ZM12 5H14V15H12V5Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M6 4L15 10L6 16V4Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="interval-controls">
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.max(1, autoAdvanceInterval - 1))
                }
                disabled={autoAdvanceInterval <= 1}
              >
                &lt;
              </button>
              <span>{autoAdvanceInterval}秒</span>
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.min(5, autoAdvanceInterval + 1))
                }
                disabled={autoAdvanceInterval >= 5}
              >
                &gt;
              </button>
            </div>
          </div>
          <button
            className={`nav-btn prev ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M20 8L12 16L20 24"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={`nav-btn next ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M12 8L20 16L12 24"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            className={`fullscreen-display-toggle ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={fullscreenDisplayMode === "single" ? "active" : ""}
              onClick={() => setFullscreenDisplayMode("single")}
              title="1枚表示"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="4"
                  y="4"
                  width="12"
                  height="12"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </button>
            <button
              className={fullscreenDisplayMode === "triple" ? "active" : ""}
              onClick={() => setFullscreenDisplayMode("triple")}
              title="3枚表示"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="2"
                  y="4"
                  width="5"
                  height="12"
                  fill="currentColor"
                  opacity="0.4"
                />
                <rect x="7.5" y="4" width="5" height="12" fill="currentColor" />
                <rect
                  x="13"
                  y="4"
                  width="5"
                  height="12"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
            </button>
          </div>
          {fullscreenDisplayMode === "single" ? (
            <div
              className="fullscreen-image-container"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={convertFileSrc(imagePath)}
                alt={selectedImage}
                className="fullscreen-image"
              />
            </div>
          ) : (
            <div
              className="fullscreen-triple-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="triple-image prev-image">
                {currentImageIndex > 0 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex - 1]) || "",
                    )}
                    alt={images[currentImageIndex - 1]}
                  />
                )}
              </div>
              <div className="triple-image current-image">
                <img src={convertFileSrc(imagePath)} alt={selectedImage} />
              </div>
              <div className="triple-image next-image">
                {currentImageIndex < images.length - 1 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex + 1]) || "",
                    )}
                    alt={images[currentImageIndex + 1]}
                  />
                )}
              </div>
            </div>
          )}
          <div
            className={`fullscreen-info ${isFullscreenUIVisible ? "visible" : "hidden"}`}
          >
            {currentImageIndex + 1} / {images.length} - {selectedImage}
          </div>
        </div>
      )}
      {isMetadataEditorOpen && (
        <div
          className="metadata-editor-modal"
          onClick={() => setIsMetadataEditorOpen(false)}
        >
          <div
            className="metadata-editor-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>画像情報の編集</h3>
            <div className="metadata-form">
              <div className="form-group">
                <label>ジャンル</label>
                <input
                  type="text"
                  value={editingMetadata.genre}
                  onChange={(e) =>
                    setEditingMetadata({
                      ...editingMetadata,
                      genre: e.target.value,
                    })
                  }
                  placeholder="例: アニメ, ゲーム, オリジナル"
                />
              </div>
              <div className="form-group">
                <label>元ネタ</label>
                <input
                  type="text"
                  value={editingMetadata.source}
                  onChange={(e) =>
                    setEditingMetadata({
                      ...editingMetadata,
                      source: e.target.value,
                    })
                  }
                  placeholder="例: 作品名、シリーズ名"
                />
              </div>
              <div className="form-group">
                <label>作者</label>
                <input
                  type="text"
                  value={editingMetadata.author}
                  onChange={(e) =>
                    setEditingMetadata({
                      ...editingMetadata,
                      author: e.target.value,
                    })
                  }
                  placeholder="例: イラストレーター名"
                />
              </div>
            </div>
            <div className="metadata-editor-actions">
              <button
                className="cancel-btn"
                onClick={() => setIsMetadataEditorOpen(false)}
              >
                キャンセル
              </button>
              <button className="save-btn" onClick={saveMetadata}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
