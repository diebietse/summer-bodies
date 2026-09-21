import { getStorage, getDownloadURL } from "firebase-admin/storage";

// The default bucket for whichever Firebase project this is running in - not hardcoded, so this also
// works for a self-hosted deployment running in its own project.
const bucket = getStorage().bucket();

async function uploadFileToStorage(data: Buffer, path: string, contentType: string): Promise<string> {
  try {
    const file = bucket.file(path);
    await file.save(data, {
      metadata: {
        contentType,
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });
    return getDownloadURL(file);
  } catch (error) {
    console.error(`Error uploading ${path} to Firebase Storage:`, error);
    throw new Error(`Failed to upload ${path}: ${error}`);
  }
}

/**
 * Uploads a PNG image in Uint8Array format to Firebase Storage
 * @param imageData - The PNG image data as Uint8Array
 * @param fileName - The name for the file (without extension, .png will be added)
 * @returns Promise<string> - The public download URL of the uploaded image
 */
export async function uploadPngToStorage(imageData: Uint8Array, fileName: string): Promise<string> {
  const fullFileName = fileName.endsWith(".png") ? fileName : `${fileName}.png`;
  return uploadFileToStorage(Buffer.from(imageData), `results/${fullFileName}`, "image/png");
}

/**
 * Uploads a logo file (svg/png/etc) to Firebase Storage for use as branding - see Firestore.uploadBranding.
 * @param fileData - The raw file bytes
 * @param fileName - The name for the file, including extension (e.g. "logo.svg")
 * @param contentType - The MIME type of the file (e.g. "image/svg+xml")
 * @returns Promise<string> - The public download URL of the uploaded file
 */
export async function uploadLogoToStorage(fileData: Buffer, fileName: string, contentType: string): Promise<string> {
  return uploadFileToStorage(fileData, `branding/${fileName}`, contentType);
}
