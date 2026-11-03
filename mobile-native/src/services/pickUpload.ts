import {errorCodes, isErrorWithCode, pick} from '@react-native-documents/picker';

const allowed = ['text/plain', 'text/markdown', 'application/pdf', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4', 'audio/wav'];
const maxSize = 10 * 1024 * 1024;

function readBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', uri);
    request.responseType = 'blob';
    request.onload = () => resolve(request.response);
    request.onerror = () => reject(new Error('Could not read the selected file.'));
    request.send();
  });
}

export async function pickUpload() {
  try {
    const [file] = await pick({type: allowed});
    const mediaType = file.type ?? 'text/plain';
    if (!allowed.includes(mediaType)) {
      throw new Error('Use a text file, PDF, PNG, JPEG, MP3, M4A, or WAV.');
    }
    if ((file.size ?? 0) > maxSize) throw new Error('Choose a file no larger than 10 MB.');
    const bytes = await readBlob(file.uri);
    if (bytes.size > maxSize) throw new Error('Choose a file no larger than 10 MB.');
    return {name: file.name ?? 'document', mediaType, bytes};
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) return null;
    throw error;
  }
}
