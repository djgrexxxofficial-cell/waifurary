// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod plugins;

#[derive(Serialize, Deserialize, Clone)]
struct ImageMetadata {
    genre: String,
    source: String,
    author: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ImageReference {
    folder: String,
    image: String,
}

#[derive(Serialize, Deserialize)]
struct MetadataGroups {
    genres: HashMap<String, Vec<ImageReference>>,
    sources: HashMap<String, Vec<ImageReference>>,
    authors: HashMap<String, Vec<ImageReference>>,
}

#[tauri::command]
fn get_image_folders() -> Result<Vec<String>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images");

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let mut folders = Vec::new();
    if let Ok(entries) = fs::read_dir(&config_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    if let Some(folder_name) = entry.file_name().to_str() {
                        folders.push(folder_name.to_string());
                    }
                }
            }
        }
    }

    folders.sort();
    Ok(folders)
}

#[tauri::command]
fn get_images_in_folder(folder: &str) -> Result<Vec<String>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images").join(folder);

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let mut images = Vec::new();
    if let Ok(entries) = fs::read_dir(&config_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Some(file_name) = entry.file_name().to_str() {
                    let lower_name = file_name.to_lowercase();
                    if lower_name.ends_with(".png") 
                        || lower_name.ends_with(".jpg") 
                        || lower_name.ends_with(".jpeg")
                        || lower_name.ends_with(".gif")
                        || lower_name.ends_with(".webp")
                        || lower_name.ends_with(".bmp")
                        || lower_name.ends_with(".svg") {
                        images.push(file_name.to_string());
                    }
                }
            }
        }
    }

    images.sort();
    Ok(images)
}

#[tauri::command]
fn get_image_path(folder: &str, image: &str) -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images").join(folder).join(image);

    Ok(config_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_image_metadata(folder: &str, image: &str, genre: &str, source: &str, author: &str) -> Result<(), String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_dir = home_dir.join(".config").join("waifurary").join("metadata").join(folder);
    
    fs::create_dir_all(&metadata_dir)
        .map_err(|e| format!("Failed to create metadata directory: {}", e))?;

    let metadata = ImageMetadata {
        genre: genre.to_string(),
        source: source.to_string(),
        author: author.to_string(),
    };

    let metadata_file = metadata_dir.join(format!("{}.json", image));
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    
    fs::write(&metadata_file, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_image_metadata(folder: &str, image: &str) -> Result<Option<ImageMetadata>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_file = home_dir
        .join(".config")
        .join("waifurary")
        .join("metadata")
        .join(folder)
        .join(format!("{}.json", image));

    if !metadata_file.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(&metadata_file)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    
    let metadata: ImageMetadata = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse metadata: {}", e))?;

    Ok(Some(metadata))
}

#[tauri::command]
fn get_metadata_groups() -> Result<MetadataGroups, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_base = home_dir.join(".config").join("waifurary").join("metadata");

    let mut genres: HashMap<String, Vec<ImageReference>> = HashMap::new();
    let mut sources: HashMap<String, Vec<ImageReference>> = HashMap::new();
    let mut authors: HashMap<String, Vec<ImageReference>> = HashMap::new();

    if !metadata_base.exists() {
        return Ok(MetadataGroups { genres, sources, authors });
    }

    // Iterate through folders
    if let Ok(folder_entries) = fs::read_dir(&metadata_base) {
        for folder_entry in folder_entries {
            if let Ok(folder_entry) = folder_entry {
                if folder_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let folder_name = folder_entry.file_name().to_string_lossy().to_string();
                    
                    // Iterate through metadata files in folder
                    if let Ok(file_entries) = fs::read_dir(folder_entry.path()) {
                        for file_entry in file_entries {
                            if let Ok(file_entry) = file_entry {
                                let file_name = file_entry.file_name().to_string_lossy().to_string();
                                if file_name.ends_with(".json") {
                                    // Read metadata file
                                    if let Ok(json) = fs::read_to_string(file_entry.path()) {
                                        if let Ok(metadata) = serde_json::from_str::<ImageMetadata>(&json) {
                                            let image_name = file_name.trim_end_matches(".json").to_string();
                                            let img_ref = ImageReference {
                                                folder: folder_name.clone(),
                                                image: image_name,
                                            };

                                            // Add to genre group
                                            if !metadata.genre.is_empty() {
                                                genres.entry(metadata.genre.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref.clone());
                                            }

                                            // Add to source group
                                            if !metadata.source.is_empty() {
                                                sources.entry(metadata.source.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref.clone());
                                            }

                                            // Add to author group
                                            if !metadata.author.is_empty() {
                                                authors.entry(metadata.author.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(MetadataGroups { genres, sources, authors })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_image_folders, 
            get_images_in_folder, 
            get_image_path,
            save_image_metadata,
            load_image_metadata,
            get_metadata_groups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
