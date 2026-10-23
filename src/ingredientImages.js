import { MAX_UPLOAD_BYTES, validIcon } from './ingredientPresentation.js';

export async function prepareIngredientImage(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a JPG or PNG image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image must be 2 MB or smaller.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((file.type === 'image/png' && !png) || (file.type === 'image/jpeg' && !jpeg)) throw new Error('File content must be a valid JPG or PNG image.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('This image could not be decoded.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.8);
    if (!validIcon(image)) throw new Error('Compressed image is still too large. Choose a simpler image.');
    return image;
  } finally { bitmap.close(); }
}
