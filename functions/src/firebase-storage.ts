import { getStorage, getDownloadURL } from "firebase-admin/storage";

// Get the Firebase Storage bucket
const bucket = getStorage().bucket("summer-bodies.appspot.com");

/**
 * Uploads a PNG image in Uint8Array format to Firebase Storage
 * @param imageData - The PNG image data as Uint8Array
 * @param fileName - The name for the file (without extension, .png will be added)
 * @returns Promise<string> - The public download URL of the uploaded image
 */
export async function uploadPngToStorage(imageData: Uint8Array, fileName: string): Promise<string> {
  try {
    // Ensure the filename has .png extension
    const fullFileName = fileName.endsWith(".png") ? fileName : `${fileName}.png`;

    // Create a reference to the file in storage
    const file = bucket.file(`results/${fullFileName}`);

    // Upload the image data
    await file.save(Buffer.from(imageData), {
      metadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });

    return getDownloadURL(file);
  } catch (error) {
    console.error("Error uploading image to Firebase Storage:", error);
    throw new Error(`Failed to upload image: ${error}`);
  }
}
