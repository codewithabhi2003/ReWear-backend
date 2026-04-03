const cloudinary = require('../config/cloudinary');

/**
 * Delete a single image from Cloudinary
 * @param {string} publicId
 */
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error(`❌ Cloudinary delete failed for ${publicId}:`, error.message);
    return null;
  }
};

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} publicIds
 */
const deleteImages = async (publicIds = []) => {
  if (!publicIds.length) return;
  await Promise.all(publicIds.map(deleteImage));
};

module.exports = { deleteImage, deleteImages };
