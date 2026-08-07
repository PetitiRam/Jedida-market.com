import imageCompression from 'browser-image-compression';

export const compressImage = async (file) => {
  const options = {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1280,
    useWebWorker: true
  };

  try {
    return await imageCompression(file, options);
  } catch (err) {
    console.error(err);
    return file;
  }
};
