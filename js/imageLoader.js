/**
 * Image Loader
 *
 * Handles file selection, validation, and loading images into memory.
 * Shared by all three apps.
 */

const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Validate that a File is a supported image format.
 * @param {File} file
 * @returns {boolean}
 */
export function validateImageFile(file) {
  return file instanceof File && SUPPORTED_FORMATS.includes(file.type);
}

/**
 * Load an image from a File object.
 * Resolves with an HTMLImageElement once fully loaded.
 *
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!validateImageFile(file)) {
      reject(new Error(`Unsupported image format: ${file.type || 'unknown'}. Supported formats: JPEG, PNG, GIF, WebP.`));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          reject(new Error('Image appears to be corrupted or empty.'));
          return;
        }
        resolve(img);
      };

      img.onerror = () => {
        reject(new Error('Failed to decode the image. The file may be corrupted.'));
      };

      img.src = reader.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the file. Please try again.'));
    };

    reader.readAsDataURL(file);
  });
}
