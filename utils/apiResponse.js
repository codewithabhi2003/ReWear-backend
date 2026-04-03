/**
 * Send a consistent JSON response
 * @param {object} res       - Express response object
 * @param {number} statusCode
 * @param {string} message
 * @param {*}      data      - Payload (optional)
 */
const sendResponse = (res, statusCode, message, data = null) => {
  const response = { success: statusCode < 400, message };
  if (data !== null) response.data = data;
  return res.status(statusCode).json(response);
};

module.exports = { sendResponse };
