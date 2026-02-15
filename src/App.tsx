import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ImageMetadata {
  source: string;
  author: string;
  tags: string[];
}

interface TagWithCount {
  tag: string;
  count: number;
}

interface ImageReference {
  folder: string;
  image: string;
}

interface MetadataGroups {
  sources: Record<string, ImageReference[]>;
  authors: Record<string, ImageReference[]>;
  tags: Record<string, ImageReference[]>;
}

interface FolderInfo {
  name: string;
  size_mb: number;
}

function App() {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
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
    source: "",
    author: "",
    tags: [],
  });
  const [browseMode, setBrowseMode] = useState<
    "folders" | "metadata" | "favorites"
  >("folders");
  const [metadataGroups, setMetadataGroups] = useState<MetadataGroups | null>(
    null,
  );
  const [metadataField, setMetadataField] = useState<
    "sources" | "authors" | "tags"
  >("tags");
  const [selectedMetadataValue, setSelectedMetadataValue] =
    useState<string>("");
  const imageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isImageLoaded, setIsImageLoaded] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">("none");
  const [showOnlyNoMetadata, setShowOnlyNoMetadata] = useState<boolean>(false);
  const [isAutoAdvanceReverse, setIsAutoAdvanceReverse] =
    useState<boolean>(false);
  const [imageMetadataMap, setImageMetadataMap] = useState<
    Map<string, ImageMetadata>
  >(new Map());
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isBulkMetadataEditorOpen, setIsBulkMetadataEditorOpen] =
    useState<boolean>(false);
  const [tagInput, setTagInput] = useState<string>("");
  const [allExistingTags, setAllExistingTags] = useState<TagWithCount[]>([]);
  const [favoriteImages, setFavoriteImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder && browseMode === "folders") {
      loadImages(selectedFolder);
    }
  }, [selectedFolder, browseMode]);

  useEffect(() => {
    if (selectedFolder && selectedImage) {
      setIsImageLoaded(false);
      loadImagePath(selectedFolder, selectedImage);
      loadMetadata(selectedFolder, selectedImage);
      const index = images.indexOf(selectedImage);
      setCurrentImageIndex(index >= 0 ? index : 0);

      // サイドバーの画像リストで選択された画像にスクロール
      const imageElement = imageRefsMap.current.get(selectedImage);
      if (imageElement) {
        imageElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedFolder, selectedImage, images]);

  useEffect(() => {
    if (isMetadataEditorOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsMetadataEditorOpen(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveMetadata();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isMetadataEditorOpen, editingMetadata, selectedFolder, selectedImage]);

  useEffect(() => {
    if (isBulkMetadataEditorOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsBulkMetadataEditorOpen(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveBulkMetadata();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isBulkMetadataEditorOpen, editingMetadata, selectedImages]);

  useEffect(() => {
    if (isFullscreen && !isMetadataEditorOpen && !isBulkMetadataEditorOpen) {
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
  }, [
    isFullscreen,
    currentImageIndex,
    isMetadataEditorOpen,
    isBulkMetadataEditorOpen,
  ]);

  useEffect(() => {
    if (
      mainViewMode === "single" &&
      !isFullscreen &&
      !isMetadataEditorOpen &&
      !isBulkMetadataEditorOpen
    ) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          prevImage();
        } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          nextImage();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "e") {
          e.preventDefault();
          openMetadataEditor();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "b") {
          e.preventDefault();
          if (selectedFolder && selectedImage) {
            const key = `${selectedFolder}/${selectedImage}`;
            setFavoriteImages((prev) => {
              const newSet = new Set(prev);
              if (newSet.has(key)) {
                newSet.delete(key);
              } else {
                newSet.add(key);
              }
              return newSet;
            });
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [
    mainViewMode,
    isFullscreen,
    currentImageIndex,
    isMetadataEditorOpen,
    isBulkMetadataEditorOpen,
    selectedFolder,
    selectedImage,
  ]);

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
      const folderList = await invoke<FolderInfo[]>("get_image_folders");
      setFolders(folderList);
      if (folderList.length > 0) {
        setSelectedFolder(folderList[0].name);
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

      // Load thumbnail paths and metadata for grid view
      const newThumbnailPaths = new Map<string, string>();
      const newMetadataMap = new Map<string, ImageMetadata>();
      for (const image of imageList) {
        try {
          const path = await invoke<string>("get_image_path", {
            folder,
            image,
          });
          newThumbnailPaths.set(image, path);

          // Load metadata for each image
          const metadata = await invoke<ImageMetadata | null>(
            "load_image_metadata",
            { folder, image },
          );
          if (metadata) {
            newMetadataMap.set(image, metadata);
          }
        } catch (err) {
          console.error(`Failed to load path for ${image}:`, err);
        }
      }
      setThumbnailPaths(newThumbnailPaths);
      setImageMetadataMap(newMetadataMap);

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
        source: editingMetadata.source,
        author: editingMetadata.author,
        tags: editingMetadata.tags,
      });
      setCurrentMetadata({ ...editingMetadata });
      // Update imageMetadataMap immediately
      setImageMetadataMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedImage, { ...editingMetadata });
        return newMap;
      });
      setIsMetadataEditorOpen(false);
      // Reload metadata groups if in metadata browse mode
      if (browseMode === "metadata") {
        loadMetadataGroups();
      }
      // Reload all tags
      loadAllTags();
    } catch (error) {
      console.error("Failed to save metadata:", error);
    }
  }

  async function saveBulkMetadata() {
    if (selectedImages.size === 0) return;

    try {
      for (const image of selectedImages) {
        await invoke("save_image_metadata", {
          folder: selectedFolder,
          image: image,
          source: editingMetadata.source,
          author: editingMetadata.author,
          tags: editingMetadata.tags,
        });
      }
      // Update imageMetadataMap for all selected images
      setImageMetadataMap((prev) => {
        const newMap = new Map(prev);
        selectedImages.forEach((image) => {
          newMap.set(image, { ...editingMetadata });
        });
        return newMap;
      });
      setIsBulkMetadataEditorOpen(false);
      setIsBulkEditMode(false);
      setSelectedImages(new Set());
      // Reload metadata groups if in metadata browse mode
      if (browseMode === "metadata") {
        loadMetadataGroups();
      }
      // Reload all tags
      loadAllTags();
    } catch (error) {
      console.error("Failed to save bulk metadata:", error);
    }
  }

  function toggleImageSelection(image: string) {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(image)) {
      newSelection.delete(image);
    } else {
      newSelection.add(image);
    }
    setSelectedImages(newSelection);
  }

  function selectAllImages() {
    setSelectedImages(new Set(images));
  }

  function deselectAllImages() {
    setSelectedImages(new Set());
  }

  function openBulkMetadataEditor() {
    setEditingMetadata({ source: "", author: "", tags: [] });
    setIsBulkMetadataEditorOpen(true);
    loadAllTags();
  }

  function toggleBulkEditMode() {
    setIsBulkEditMode(!isBulkEditMode);
    if (isBulkEditMode) {
      setSelectedImages(new Set());
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

    // Load thumbnail paths and metadata for all referenced images
    const newThumbnailPaths = new Map<string, string>();
    const newMetadataMap = new Map<string, ImageMetadata>();
    for (const ref of refs) {
      try {
        const path = await invoke<string>("get_image_path", {
          folder: ref.folder,
          image: ref.image,
        });
        newThumbnailPaths.set(ref.image, path);

        // Load metadata for each image
        const metadata = await invoke<ImageMetadata | null>(
          "load_image_metadata",
          { folder: ref.folder, image: ref.image },
        );
        if (metadata) {
          newMetadataMap.set(ref.image, metadata);
        }
      } catch (err) {
        console.error(`Failed to load path for ${ref.image}:`, err);
      }
    }
    setThumbnailPaths(newThumbnailPaths);
    setImageMetadataMap(newMetadataMap);

    if (refs.length > 0) {
      setSelectedFolder(refs[0].folder);
      setSelectedImage(refs[0].image);
    } else {
      setSelectedImage("");
      setImagePath("");
    }
  }

  async function openMetadataEditor() {
    // 最新のメタデータを読み込む
    if (selectedFolder && selectedImage) {
      try {
        const metadata = await invoke<ImageMetadata | null>(
          "load_image_metadata",
          {
            folder: selectedFolder,
            image: selectedImage,
          },
        );
        setCurrentMetadata(metadata);
        setEditingMetadata(metadata || { source: "", author: "", tags: [] });
        setIsMetadataEditorOpen(true);
        loadAllTags();
      } catch (error) {
        console.error("Failed to load metadata:", error);
        setEditingMetadata({ source: "", author: "", tags: [] });
        setIsMetadataEditorOpen(true);
        loadAllTags();
      }
    } else {
      setEditingMetadata(
        currentMetadata || { source: "", author: "", tags: [] },
      );
      setIsMetadataEditorOpen(true);
      loadAllTags();
    }
  }

  async function loadAllTags() {
    try {
      const tags = await invoke<TagWithCount[]>("get_all_tags_with_count");
      setAllExistingTags(tags);
    } catch (error) {
      console.error("Failed to load all tags:", error);
      setAllExistingTags([]);
    }
  }

  function addTag(tag: string) {
    const trimmedTag = tag.trim();
    if (trimmedTag && !editingMetadata.tags.includes(trimmedTag)) {
      setEditingMetadata({
        ...editingMetadata,
        tags: [...editingMetadata.tags, trimmedTag],
      });
      setTagInput("");
    }
  }

  function removeTag(tagToRemove: string) {
    setEditingMetadata({
      ...editingMetadata,
      tags: editingMetadata.tags.filter((tag) => tag !== tagToRemove),
    });
  }

  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
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
    let filteredImages = images;

    // メタ情報なしフィルター
    if (showOnlyNoMetadata) {
      filteredImages = images.filter((image) => {
        const metadata = imageMetadataMap.get(image);
        return (
          !metadata ||
          (!metadata.source && !metadata.author && metadata.tags.length === 0)
        );
      });
    }

    // ソート
    if (sortOrder === "none") {
      return filteredImages;
    }
    const sorted = [...filteredImages].sort((a, b) => {
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
    <div className="flex flex-col h-screen w-screen bg-primary dark:bg-gray-800 overflow-hidden">
      {isHeaderVisible && (
        <div className="h-9 bg-primary flex items-center px-4 border-b border-gray-300 select-none flex-shrink-0" data-tauri-drag-region>
          <div className="flex items-center justify-between w-full h-full">
            <div className="flex gap-3 items-center ml-auto">
              <div className="flex gap-1">
                <button
                  className={mainViewMode === "single" ? "w-7 h-7 p-0 bg-white text-black rounded border-none cursor-pointer flex items-center justify-center" : "w-7 h-7 p-0 bg-transparent text-gray-600 rounded border-none cursor-pointer flex items-center justify-center hover:bg-gray-200"}
                  onClick={() => setMainViewMode("single")}
                  disabled={images.length === 0}
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
                  className={mainViewMode === "grid" ? "w-7 h-7 p-0 bg-white text-black rounded border-none cursor-pointer flex items-center justify-center" : "w-7 h-7 p-0 bg-transparent text-gray-600 rounded border-none cursor-pointer flex items-center justify-center hover:bg-gray-200"}
                  onClick={() => setMainViewMode("grid")}
                  disabled={images.length === 0}
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
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.max(2, mainGridColumns - 1))
                      }
                      disabled={mainGridColumns <= 2 || images.length === 0}
                      className="w-5.5 h-5.5 p-0 text-xs bg-primary text-gray-800 rounded border-none cursor-pointer flex items-center justify-center hover:bg-blue-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      &lt;
                    </button>
                    <span className="text-xs text-gray-800 min-w-5 text-center font-medium">{mainGridColumns}</span>
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.min(12, mainGridColumns + 1))
                      }
                      disabled={mainGridColumns >= 12 || images.length === 0}
                      className="w-5.5 h-5.5 p-0 text-xs bg-primary text-gray-800 rounded border-none cursor-pointer flex items-center justify-center hover:bg-blue-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
              <button
                className="w-7 h-7 bg-transparent text-gray-600 rounded cursor-pointer flex items-center justify-center hover:bg-gray-200 hover:text-gray-800"
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
      {!isHeaderVisible && (
        <button
          className="fixed top-2 right-1/2 transform translate-x-1/2 w-10 h-6 bg-secondary text-gray-600 rounded-b-lg cursor-pointer flex items-center justify-center z-25 hover:bg-blue-500 hover:text-white hover:translate-y-0.5 transition-all"
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
      <div className="flex flex-1 overflow-hidden">
        {isSidebarVisible && (
          <div className="w-80 bg-primary dark:bg-gray-900 border-r border-border dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-3 bg-secondary dark:bg-gray-800 rounded-md">
              <div className="flex gap-2">
                <button
                  className={browseMode === "folders" ? "px-4 py-2 bg-white text-black rounded-sm text-sm font-medium" : "px-4 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-sm text-sm font-medium transition-colors"}
                  onClick={() => setBrowseMode("folders")}
                >
                  フォルダ別
                </button>
                <button
                  className={browseMode === "metadata" ? "px-4 py-2 bg-white text-black rounded-sm text-sm font-medium" : "px-4 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-sm text-sm font-medium transition-colors"}
                  onClick={() => setBrowseMode("metadata")}
                >
                  メタ別
                </button>
                <button
                  className={browseMode === "favorites" ? "px-4 py-2 bg-white text-black rounded-sm text-sm font-medium" : "px-4 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-sm text-sm font-medium transition-colors"}
                  onClick={() => setBrowseMode("favorites")}
                >
                  ★
                </button>
              </div>
              <button
                className="p-1.5 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-sm transition-colors flex items-center justify-center"
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
                <div className="overflow-y-auto px-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Folders</h3>
                  {folders.map((folder) => (
                    <div
                      key={folder.name}
                      className={selectedFolder === folder.name ?
                        "flex items-center gap-2 px-3 py-2 mb-1 bg-blue-500 text-white border border-blue-500 rounded-lg cursor-pointer text-sm font-semibold" :
                        "flex items-center gap-2 px-3 py-2 mb-1 bg-primary border border-transparent rounded-lg cursor-pointer text-sm text-gray-600 hover:bg-gray-200 hover:border-blue-500"
                      }
                      onClick={() => setSelectedFolder(folder.name)}
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
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{folder.name}</span>
                      <span className="text-xs text-gray-500 font-medium flex-shrink-0">
                        {folder.size_mb.toFixed(0)}MB
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : browseMode === "metadata" ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex gap-1 p-3 bg-secondary dark:bg-gray-800 border-b border-gray-200">
                  <button
                    className={metadataField === "tags" ? "flex-1 px-3 py-2 bg-white text-black rounded-lg text-sm font-medium whitespace-nowrap" : "flex-1 px-3 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer"}
                    onClick={() => {
                      setMetadataField("tags");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    タグ
                  </button>
                  <button
                    className={metadataField === "sources" ? "flex-1 px-3 py-2 bg-white text-black rounded-lg text-sm font-medium whitespace-nowrap" : "flex-1 px-3 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer"}
                    onClick={() => {
                      setMetadataField("sources");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    元ネタ
                  </button>
                  <button
                    className={metadataField === "authors" ? "flex-1 px-3 py-2 bg-white text-black rounded-lg text-sm font-medium whitespace-nowrap" : "flex-1 px-3 py-2 bg-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-800 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer"}
                    onClick={() => {
                      setMetadataField("authors");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    作者
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <h3 className="text-sm text-gray-800 dark:text-gray-200 mb-3 font-semibold">
                    {metadataField === "tags" && "タグ一覧"}
                    {metadataField === "sources" && "元ネタ一覧"}
                    {metadataField === "authors" && "作者一覧"}
                  </h3>
                  {metadataGroups &&
                    Object.keys(metadataGroups[metadataField]).length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-5">データがありません</p>
                    )}
                  {metadataGroups &&
                    Object.entries(metadataGroups[metadataField]).map(
                      ([value, refs]) => (
                        <div
                          key={value}
                          className={selectedMetadataValue === value ? "flex items-center justify-between px-3 py-2.5 mb-1 bg-blue-500 border-2 border-blue-300 rounded-lg cursor-pointer" : "flex items-center justify-between px-3 py-2.5 mb-1 bg-secondary border-2 border-transparent rounded-lg cursor-pointer hover:bg-gray-200 hover:border-blue-500"}
                          onClick={() => setSelectedMetadataValue(value)}
                        >
                          <span className="text-sm text-gray-800 font-medium flex-1">{value}</span>
                          <span className="text-xs text-gray-500 ml-2">({refs.length})</span>
                        </div>
                      ),
                    )}
                </div>
              </div>
            ) : browseMode === "favorites" ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3">
                  <h3 className="text-sm text-gray-800 dark:text-gray-200 mb-3 font-semibold">お気に入り ({favoriteImages.size})</h3>
                  {favoriteImages.size === 0 && (
                    <p className="text-gray-500 text-sm text-center py-5">お気に入りがありません</p>
                  )}
                  {Array.from(favoriteImages).map((favKey) => {
                    const [folder, image] = favKey.split("/");
                    return (
                      <div
                        key={favKey}
                        className={selectedFolder === folder && selectedImage === image ? "flex flex-col px-3 py-2.5 mb-1 bg-blue-500 border-2 border-blue-300 rounded-lg cursor-pointer" : "flex flex-col px-3 py-2.5 mb-1 bg-secondary border-2 border-transparent rounded-lg cursor-pointer hover:bg-gray-200 hover:border-blue-500"}
                        onClick={() => {
                          setSelectedFolder(folder);
                          setSelectedImage(image);
                          handleImageClick(image);
                        }}
                      >
                        <span className="text-sm text-gray-800 font-medium mb-1">{image}</span>
                        <span className="text-xs text-gray-500">({folder})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="p-3 border-b border-gray-300 flex flex-col gap-3">
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  className={isBulkEditMode ? "p-2 border border-blue-500 bg-blue-500 text-white rounded-lg cursor-pointer flex items-center justify-center transition-colors" : "p-2 border border-gray-300 bg-primary text-gray-500 rounded-lg cursor-pointer flex items-center justify-center transition-colors hover:bg-gray-200 hover:border-blue-500"}
                  onClick={toggleBulkEditMode}
                  title="一括編集モード"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 3L6 3M3 8L6 8M3 13L6 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <rect
                      x="9"
                      y="2"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                    <rect
                      x="9"
                      y="7"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                    <rect
                      x="9"
                      y="12"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                {isBulkEditMode && (
                  <>
                    <button
                      className="px-3 py-1.5 border border-gray-300 bg-primary text-gray-800 rounded-lg cursor-pointer text-xs font-medium transition-colors hover:bg-gray-200 hover:border-blue-500"
                      onClick={selectAllImages}
                      title="全て選択"
                    >
                      全選択
                    </button>
                    <button
                      className="px-3 py-1.5 border border-gray-300 bg-primary text-gray-800 rounded-lg cursor-pointer text-xs font-medium transition-colors hover:bg-gray-200 hover:border-blue-500"
                      onClick={deselectAllImages}
                      title="全て解除"
                    >
                      解除
                    </button>
                    <button
                      className="px-3 py-1.5 bg-blue-500 text-white border border-blue-500 rounded-lg cursor-pointer text-xs font-medium transition-colors hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={openBulkMetadataEditor}
                      disabled={selectedImages.size === 0}
                      title={`選択した${selectedImages.size}件を編集`}
                    >
                      編集({selectedImages.size})
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-1 bg-primary rounded-lg p-1">
                <button
                  className={viewMode === "list" ? "flex-1 p-2 bg-blue-500 text-white rounded-md cursor-pointer flex items-center justify-center" : "flex-1 p-2 bg-transparent text-gray-500 rounded-md cursor-pointer flex items-center justify-center hover:bg-gray-200"}
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
                  className={viewMode === "grid" ? "flex-1 p-2 bg-blue-500 text-white rounded-md cursor-pointer flex items-center justify-center" : "flex-1 p-2 bg-transparent text-gray-500 rounded-md cursor-pointer flex items-center justify-center hover:bg-gray-200"}
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">グリッド数</label>
                  <div className="flex items-center gap-2 bg-primary rounded-lg p-1">
                    <button
                      onClick={() =>
                        setGridColumns(Math.max(3, gridColumns - 1))
                      }
                      disabled={gridColumns <= 3}
                      className="w-8 h-8 bg-secondary text-gray-800 rounded-md cursor-pointer flex items-center justify-center text-base font-bold hover:bg-blue-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &lt;
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold text-gray-800">{gridColumns}</span>
                    <button
                      onClick={() =>
                        setGridColumns(Math.min(6, gridColumns + 1))
                      }
                      disabled={gridColumns >= 6}
                      className="w-8 h-8 bg-secondary text-gray-800 rounded-md cursor-pointer flex items-center justify-center text-base font-bold hover:bg-blue-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 m-0">画像一覧 ({getSortedImages().length})</h3>
                <div className="flex gap-1.5 items-center">
                  <button
                    className={showOnlyNoMetadata ? "min-w-10 h-7 px-2.5 bg-white text-black border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center transition-colors flex-shrink-0 text-xs font-semibold" : "min-w-10 h-7 px-2.5 bg-primary text-gray-600 border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center transition-colors flex-shrink-0 text-xs font-semibold hover:bg-gray-200 hover:border-blue-500"}
                    onClick={() => setShowOnlyNoMetadata(!showOnlyNoMetadata)}
                    title={
                      showOnlyNoMetadata ? "すべて表示" : "メタ情報なしのみ表示"
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2 4H14M4 8H12M6 12H10"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    className={sortOrder !== "none" ? "min-w-10 h-7 px-2.5 bg-white text-black border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center transition-colors flex-shrink-0 text-xs font-semibold" : "min-w-10 h-7 px-2.5 bg-primary text-gray-600 border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center transition-colors flex-shrink-0 text-xs font-semibold hover:bg-gray-200 hover:border-blue-500"}
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
              </div>
              {images.length === 0 && selectedFolder && (
                <p className="text-gray-500 text-sm italic text-center py-5">画像がありません</p>
              )}
              {viewMode === "list" &&
                getSortedImages().map((image, _index) => (
                  <div
                    key={image}
                    ref={(el) => {
                      if (el) {
                        imageRefsMap.current.set(image, el);
                      } else {
                        imageRefsMap.current.delete(image);
                      }
                    }}
                    className={selectedImage === image ?
                      "px-4 py-3 mb-1.5 bg-blue-500 text-white border border-blue-500 rounded-lg cursor-pointer text-sm font-semibold break-words" :
                      "px-4 py-3 mb-1.5 bg-primary text-gray-600 border border-gray-300 rounded-lg cursor-pointer text-sm break-words hover:bg-gray-200 hover:border-blue-500"
                    }
                    onClick={() => handleImageClick(image)}
                  >
                    {image}
                  </div>
                ))}
              {viewMode === "grid" && (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
                >
                  {getSortedImages().map((image, _index) => {
                    const thumbPath = thumbnailPaths.get(image);
                    const metadata = imageMetadataMap.get(image);
                    const hasMetadata =
                      metadata &&
                      (metadata.source ||
                        metadata.author ||
                        metadata.tags.length > 0);
                    const isSelected = selectedImages.has(image);
                    const isCurrentImage = selectedImage === image;
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
                        className={`aspect-square bg-primary border rounded-lg cursor-pointer overflow-hidden flex flex-col relative ${
                          isSelected ? "border-blue-500 border-4 shadow-lg shadow-blue-300/30" : "border-gray-300"
                        } ${
                          isCurrentImage ? "bg-blue-500 border-blue-500 shadow-lg shadow-blue-400/40" : ""
                        } hover:border-blue-500`}
                        onClick={() =>
                          isBulkEditMode
                            ? toggleImageSelection(image)
                            : handleImageClick(image)
                        }
                        title={image}
                      >
                        {isBulkEditMode && (
                          <div className="absolute top-0.5 left-0.5 z-10 rounded-md flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleImageSelection(image)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4.5 h-4.5 cursor-pointer accent-blue-500"
                            />
                          </div>
                        )}
                        <div className="flex-1 flex items-center justify-center overflow-hidden bg-secondary relative">
                          {thumbPath ? (
                            <img src={convertFileSrc(thumbPath)} alt={image} className="w-full h-full object-cover" />
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
                          {hasMetadata && (
                            <div className="absolute bottom-0.5 right-0.5 bg-black/60 dark:bg-white/20 rounded pointer-events-none p-0.5 flex items-center justify-center text-white">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ff6a00"
                                strokeWidth="3.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                                <circle
                                  cx="7.5"
                                  cy="7.5"
                                  r=".5"
                                  fill="#ff6a00"
                                />
                              </svg>
                            </div>
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
            className="fixed left-4 top-1/2 transform -translate-y-1/2 w-10 h-15 bg-secondary text-gray-800 rounded-r-md cursor-pointer flex items-center justify-center z-25 hover:bg-blue-500 hover:text-white hover:w-12 transition-all"
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
        <div className="flex-1 flex flex-col bg-primary dark:bg-gray-800 overflow-hidden relative min-h-0" onWheel={handleWheel}>
          {mainViewMode === "single" && imagePath && (
            <div className="flex-1 flex flex-col justify-center items-center min-h-0 overflow-hidden">
              <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-secondary px-3 py-2 rounded-md z-10">
                <button
                  onClick={handleZoomOut}
                  title="縮小 (Ctrl + スクロール)"
                  className="flex items-center justify-center w-8 h-8 bg-primary text-gray-800 rounded-lg cursor-pointer hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95"
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
                <span className="text-sm font-semibold text-gray-600 min-w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={handleZoomIn} title="拡大 (Ctrl + スクロール)" className="flex items-center justify-center w-8 h-8 bg-primary text-gray-800 rounded-lg cursor-pointer hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 4V12M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className="px-1 h-8 bg-primary text-gray-800 rounded-lg cursor-pointer hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95"
                  onClick={handleResetZoom}
                  title="リセット"
                >
                  Reset
                </button>
              </div>
              {currentMetadata && (
                <div className="absolute bottom-20 left-6 bg-black/70 px-4 py-3 rounded-xl backdrop-blur-md z-10 max-w-75">
                  <div className="text-white text-sm my-1 leading-relaxed">
                    <strong className="text-white/80 mr-2">タグ:</strong>{" "}
                    {currentMetadata.tags.length > 0
                      ? currentMetadata.tags.join(", ")
                      : "不明"}
                  </div>
                  <div className="text-white text-sm my-1 leading-relaxed">
                    <strong className="text-white/80 mr-2">元ネタ:</strong> {currentMetadata.source || "不明"}
                  </div>
                  <div className="text-white text-sm my-1 leading-relaxed">
                    <strong className="text-white/80 mr-2">作者:</strong> {currentMetadata.author || "不明"}
                  </div>
                </div>
              )}
              <button
                className="absolute bottom-6 left-6 h-10 px-3 bg-secondary text-gray-800 rounded-2xl cursor-pointer flex items-center justify-center gap-1.5 z-10 whitespace-nowrap transition-all hover:bg-blue-500 hover:text-white hover:scale-110"
                onClick={openMetadataEditor}
                title="情報を編集 (Cmd + E)"
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
                <span className="text-xs font-medium opacity-90">(Cmd + E)</span>
              </button>
              <button
                className={`absolute bottom-6 h-10 px-3 rounded-2xl cursor-pointer flex items-center justify-center gap-1.5 z-10 whitespace-nowrap transition-all hover:scale-110 ${
                  selectedImage && favoriteImages.has(`${selectedFolder}/${selectedImage}`)
                    ? "left-38.5 bg-yellow-400 text-black"
                    : "left-38.5 bg-secondary text-gray-800 hover:bg-blue-500 hover:text-white"
                }`}
                onClick={() => {
                  if (selectedFolder && selectedImage) {
                    const key = `${selectedFolder}/${selectedImage}`;
                    setFavoriteImages((prev) => {
                      const newSet = new Set(prev);
                      if (newSet.has(key)) {
                        newSet.delete(key);
                      } else {
                        newSet.add(key);
                      }
                      return newSet;
                    });
                  }
                }}
                title="お気に入り (Cmd + B)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2L9.5 6.5H14L10.5 9.5L12 14L8 11L4 14L5.5 9.5L2 6.5H6.5L8 2Z"
                    fill={
                      selectedImage &&
                      favoriteImages.has(`${selectedFolder}/${selectedImage}`)
                        ? "#FFD700"
                        : "none"
                    }
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-xs font-medium opacity-90">(Cmd + B)</span>
              </button>
              <div className="w-full flex-1 flex justify-center items-center overflow-auto min-h-0">
                <img
                  src={convertFileSrc(imagePath)}
                  alt={selectedImage}
                  className={`max-w-full max-h-full object-contain rounded-2xl origin-center overflow-hidden ${isImageLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300 ease-out`}
                  style={{ transform: `scale(${zoom})`, cursor: "pointer", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                  onClick={() => openFullscreen(currentImageIndex)}
                  onLoad={() => setIsImageLoaded(true)}
                />
              </div>
            </div>
          )}
          {mainViewMode === "grid" && images.length > 0 && (
            <div className="flex-1 overflow-auto p-2">
              <div
                className="grid gap-0 auto-rows-fr"
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
                      className={`relative aspect-square rounded-xl overflow-hidden bg-secondary cursor-pointer border-3 transition-colors ${selectedImage === image ? "border-blue-500" : "border-transparent hover:border-blue-500"}`}
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
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center text-gray-500 text-base max-w-100 p-10 bg-secondary rounded-xl shadow-md">
              <p className="m-0 leading-relaxed">~/.config/waifurary/images フォルダに画像を配置してください</p>
            </div>
          )}
          {!imagePath && folders.length > 0 && images.length === 0 && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center text-gray-500 text-base max-w-100 p-10 bg-secondary rounded-xl shadow-md">
              <p className="m-0 leading-relaxed">選択したフォルダに画像がありません</p>
            </div>
          )}
        </div>
      </div>
      {isFullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center animate-fadeIn" onClick={closeFullscreen}>
          <button
            className={isFullscreenUIVisible ?
              "absolute top-5 right-5 w-12 h-12 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-100 pointer-events-auto transition-opacity hover:bg-white/20 hover:rotate-90" :
              "absolute top-5 right-5 w-12 h-12 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-0 pointer-events-none transition-opacity"
            }
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
            className={isFullscreenUIVisible ?
              "absolute top-5 left-5 flex items-center gap-3 bg-white/10 px-4 py-2 rounded-3xl backdrop-blur-md z-10 opacity-100 pointer-events-auto transition-opacity" :
              "absolute top-5 left-5 flex items-center gap-3 bg-white/10 px-4 py-2 rounded-3xl backdrop-blur-md z-10 opacity-0 pointer-events-none transition-opacity"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={isAutoAdvanceReverse ?"w-10 h-10 bg-purple-500 text-white rounded-full cursor-pointer transition-all flex items-center justify-center hover:bg-purple-600" : "w-10 h-10 bg-white/10 text-white rounded-full cursor-pointer transition-all flex items-center justify-center hover:bg-white/20 hover:scale-110"}
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
              className={isAutoAdvance ? "w-10 h-10 bg-blue-500 text-white rounded-full cursor-pointer transition-all flex items-center justify-center hover:bg-blue-600" : "w-10 h-10 bg-white/10 text-white rounded-full cursor-pointer transition-all flex items-center justify-center hover:bg-white/20 hover:scale-110"}
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
            <div className="flex items-center gap-2 text-white text-sm font-medium">
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.max(1, autoAdvanceInterval - 1))
                }
                disabled={autoAdvanceInterval <= 1}
                className="w-7 h-7 bg-white/10 text-white rounded cursor-pointer flex items-center justify-center text-base hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                &lt;
              </button>
              <span className="min-w-10 text-center">{autoAdvanceInterval}秒</span>
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.min(5, autoAdvanceInterval + 1))
                }
                disabled={autoAdvanceInterval >= 5}
                className="w-7 h-7 bg-white/10 text-white rounded cursor-pointer flex items-center justify-center text-base hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                &gt;
              </button>
            </div>
          </div>
          <button
            className={isFullscreenUIVisible ?
              "absolute top-1/2 transform -translate-y-1/2 left-5 w-16 h-16 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-100 pointer-events-auto transition-opacity hover:bg-white/20 hover:scale-110" :
              "absolute top-1/2 transform -translate-y-1/2 left-5 w-16 h-16 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-0 pointer-events-none transition-opacity"
            }
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
            className={isFullscreenUIVisible ?
              "absolute top-1/2 transform -translate-y-1/2 right-5 w-16 h-16 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-100 pointer-events-auto transition-opacity hover:bg-white/20 hover:scale-110" :
              "absolute top-1/2 transform -translate-y-1/2 right-5 w-16 h-16 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center backdrop-blur-md z-10 opacity-0 pointer-events-none transition-opacity"
            }
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
            className={isFullscreenUIVisible ?
              "absolute top-5 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-md z-10 opacity-100 pointer-events-auto transition-opacity" :
              "absolute top-5 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-md z-10 opacity-0 pointer-events-none transition-opacity"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={fullscreenDisplayMode === "single" ? "w-10 h-10 bg-blue-500 text-white rounded-full cursor-pointer flex items-center justify-center hover:bg-blue-600" : "w-10 h-10 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center hover:bg-white/20"}
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
              className={fullscreenDisplayMode === "triple" ? "w-10 h-10 bg-blue-500 text-white rounded-full cursor-pointer flex items-center justify-center hover:bg-blue-600" : "w-10 h-10 bg-white/10 text-white rounded-full cursor-pointer flex items-center justify-center hover:bg-white/20"}
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
              className="max-w-[90vw] h-screen flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={convertFileSrc(imagePath)}
                alt={selectedImage}
                className="max-w-full h-screen object-contain"
              />
            </div>
          ) : (
            <div
              className="w-screen h-screen flex items-center justify-center gap-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-screen flex-1 flex items-center justify-center overflow-hidden opacity-50 blur-sm">
                {currentImageIndex > 0 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex - 1]) || "",
                    )}
                    alt={images[currentImageIndex - 1]}
                    className="h-screen w-full object-contain"
                  />
                )}
              </div>
              <div className="h-screen flex-[1.5] flex items-center justify-center overflow-hidden">
                <img src={convertFileSrc(imagePath)} alt={selectedImage} className="h-screen w-auto max-w-full object-contain" />
              </div>
              <div className="h-screen flex-1 flex items-center justify-center overflow-hidden opacity-50 blur-sm">
                {currentImageIndex < images.length - 1 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex + 1]) || "",
                    )}
                    alt={images[currentImageIndex + 1]}
                    className="h-screen w-full object-contain"
                  />
                )}
              </div>
            </div>
          )}
          <div
            className={isFullscreenUIVisible ?
              "absolute bottom-7.5 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-md text-sm backdrop-blur-md whitespace-nowrap opacity-100 pointer-events-auto transition-opacity" :
              "absolute bottom-7.5 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-md text-sm backdrop-blur-md whitespace-nowrap opacity-0 pointer-events-none transition-opacity"
            }
          >
            {currentImageIndex + 1} / {images.length} - {selectedImage}
          </div>
        </div>
      )}
      {isMetadataEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-start animate-fadeIn"
          onClick={() => setIsMetadataEditorOpen(false)}
        >
          <div
            className="bg-primary p-4 w-96 relative h-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 w-8 h-8 bg-transparent text-gray-500 cursor-pointer flex items-center justify-center rounded-md transition-colors z-1 hover:bg-gray-200 hover:text-gray-800"
              onClick={() => setIsMetadataEditorOpen(false)}
              title="閉じる (Esc)"
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
            <h3 className="m-0 mb-5 text-gray-800 text-xl pr-10">画像情報の編集</h3>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto pb-69">
              <div className="flex flex-col gap-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-800 text-sm font-medium">元ネタ</label>
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
                    className="py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-800 text-sm font-medium">作者</label>
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
                    className="py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-800 text-sm font-medium">タグ</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagInputKeyDown}
                      placeholder="タグを入力してEnter"
                      className="flex-1 py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
                      onClick={() => addTag(tagInput)}
                    >
                      追加
                    </button>
                  </div>
                  {editingMetadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {editingMetadata.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-xl text-sm font-medium">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="border-0 bg-transparent text-white text-base font-bold cursor-pointer p-0 w-4.5 h-4.5 flex items-center justify-center rounded-full transition-colors hover:bg-white/20"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {allExistingTags.length > 0 && (
                <div className="absolute bottom-15 left-0 right-0 p-4 border-t border-gray-300 bg-secondary h-100 flex flex-col overflow-hidden">
                  <div className="text-xs text-gray-500 mb-2 font-medium">既存のタグ:</div>
                  <div className="flex flex-wrap gap-1.5 overflow-y-auto flex-1 content-start">
                    {allExistingTags
                      .filter(
                        (tagData) =>
                          !editingMetadata.tags.includes(tagData.tag),
                      )
                      .map((tagData) => (
                        <button
                          key={tagData.tag}
                          type="button"
                          className="py-1 px-2.5 border border-gray-300 bg-secondary text-gray-800 rounded-lg text-xs cursor-pointer transition-colors hover:bg-blue-500 hover:text-white hover:border-blue-500"
                          onClick={() => addTag(tagData.tag)}
                        >
                          {tagData.tag} ({tagData.count})
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-end gap-3 p-3 bg-primary border-t border-gray-300">
              <button
                className="py-2.5 px-5 bg-secondary text-gray-800 rounded-xl text-sm font-medium cursor-pointer hover:bg-gray-200"
                onClick={() => setIsMetadataEditorOpen(false)}
              >
                キャンセル (Esc)
              </button>
              <button
                className="py-2.5 px-5 bg-blue-500/80 text-white rounded-xl text-sm font-medium cursor-pointer hover:bg-blue-500 hover:-translate-y-0.5 transition-all"
                onClick={saveMetadata}
              >
                保存 (Cmd + Enter)
              </button>
            </div>
          </div>
        </div>
      )}
      {isBulkMetadataEditorOpen && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-end justify-start animate-fadeIn"
          onClick={() => setIsBulkMetadataEditorOpen(false)}
        >
          <div
            className="bg-primary p-4 w-96 relative h-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 w-8 h-8 bg-transparent text-gray-500 cursor-pointer flex items-center justify-center rounded-md transition-colors z-1 hover:bg-gray-200 hover:text-gray-800"
              onClick={() => setIsBulkMetadataEditorOpen(false)}
              title="閉じる (Esc)"
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
            <h3 className="m-0 mb-5 text-gray-800 text-xl pr-10">一括編集 ({selectedImages.size}件)</h3>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-800 text-sm font-medium">元ネタ</label>
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
                  className="py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-800 text-sm font-medium">作者</label>
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
                  className="py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-800 text-sm font-medium">タグ</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="タグを入力してEnter"
                    className="flex-1 py-2.5 px-3 border-2 border-secondary bg-secondary text-gray-800 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-primary placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
                    onClick={() => addTag(tagInput)}
                  >
                    追加
                  </button>
                </div>
                {editingMetadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {editingMetadata.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-xl text-sm font-medium">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="border-0 bg-transparent text-white text-base font-bold cursor-pointer p-0 w-4.5 h-4.5 flex items-center justify-center rounded-full transition-colors hover:bg-white/20"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {allExistingTags.length > 0 && (
                  <div className="mt-6 p-4 border-t border-gray-300 bg-secondary max-h-100 flex flex-col overflow-hidden">
                    <div className="text-xs text-gray-500 mb-2 font-medium">既存のタグ:</div>
                    <div className="flex flex-wrap gap-1.5 overflow-y-auto flex-1 content-start">
                      {allExistingTags
                        .filter(
                          (tagData) =>
                            !editingMetadata.tags.includes(tagData.tag),
                        )
                        .map((tagData) => (
                          <button
                            key={tagData.tag}
                            type="button"
                            className="py-1 px-2.5 border border-gray-300 bg-secondary text-gray-800 rounded-lg text-xs cursor-pointer transition-colors hover:bg-blue-500 hover:text-white hover:border-blue-500"
                            onClick={() => addTag(tagData.tag)}
                          >
                            {tagData.tag} ({tagData.count})
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-end gap-3 p-3 bg-primary border-t border-gray-300">
              <button
                className="py-2.5 px-5 bg-secondary text-gray-800 rounded-xl text-sm font-medium cursor-pointer hover:bg-gray-200"
                onClick={() => setIsBulkMetadataEditorOpen(false)}
              >
                キャンセル (Esc)
              </button>
              <button
                className="py-2.5 px-5 bg-blue-500/80 text-white rounded-xl text-sm font-medium cursor-pointer hover:bg-blue-500 hover:-translate-y-0.5 transition-all"
                onClick={saveBulkMetadata}
              >
                保存 (Cmd + Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
