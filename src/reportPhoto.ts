export const REPORT_PHOTO_MAX_BYTES = 400_000;
const ORIGINAL_MAX_BYTES = 8_000_000;
const MAX_PIXELS = 24_000_000;

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Procesamiento cancelado.', 'AbortError');
}

async function decodeImage(
  file: File,
  signal: AbortSignal,
): Promise<{ image: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    if (signal.aborted) {
      bitmap.close();
      checkCancelled(signal);
    }
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      const clean = () => {
        signal.removeEventListener('abort', cancel);
        img.onload = null;
        img.onerror = null;
      };
      const cancel = () => {
        clean();
        img.src = '';
        reject(new DOMException('Procesamiento cancelado.', 'AbortError'));
      };
      img.onload = () => {
        clean();
        resolve({
          image: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          close: () => {},
        });
      };
      img.onerror = () => {
        clean();
        reject(new Error('No pudimos abrir esa imagen. Prueba otra foto.'));
      };
      signal.addEventListener('abort', cancel, { once: true });
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readDataURL(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clean = () => signal.removeEventListener('abort', cancel);
    const cancel = () => {
      reader.abort();
      clean();
      reject(new DOMException('Procesamiento cancelado.', 'AbortError'));
    };
    reader.onload = () => {
      clean();
      resolve(String(reader.result));
    };
    reader.onerror = () => {
      clean();
      reject(new Error('No pudimos leer la foto procesada.'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    reader.readAsDataURL(blob);
  });
}

/** Re-encode pixels as JPEG: the uploaded file never includes the original EXIF metadata. */
export async function prepareReportPhoto(file: File, signal: AbortSignal): Promise<string> {
  checkCancelled(signal);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Elige una foto JPEG, PNG o WebP.');
  if (!file.size || file.size > ORIGINAL_MAX_BYTES)
    throw new Error('La imagen original debe pesar entre 1 byte y 8 MB.');
  const decoded = await decodeImage(file, signal);
  try {
    checkCancelled(signal);
    if (
      !decoded.width ||
      !decoded.height ||
      decoded.width * decoded.height > MAX_PIXELS ||
      Math.max(decoded.width, decoded.height) > 16000
    ) {
      throw new Error('La imagen es demasiado grande. Elige una foto de hasta 24 megapíxeles.');
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(
        'Este dispositivo no pudo procesar la foto. Puedes quitarla y enviar el texto.',
      );
    const scale = Math.min(1, 1280 / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    for (const quality of [0.82, 0.68, 0.5]) {
      checkCancelled(signal);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('No pudimos comprimir la foto.'))),
          'image/jpeg',
          quality,
        ),
      );
      checkCancelled(signal);
      if (blob.type !== 'image/jpeg')
        throw new Error('El dispositivo no pudo convertir la foto a un formato seguro.');
      if (blob.size <= REPORT_PHOTO_MAX_BYTES) {
        const result = await readDataURL(blob, signal);
        checkCancelled(signal);
        return result;
      }
    }
    throw new Error(
      'La foto sigue pesando más de 400 KB. Elige una imagen más sencilla o quítala para enviar el texto.',
    );
  } finally {
    decoded.close();
  }
}
