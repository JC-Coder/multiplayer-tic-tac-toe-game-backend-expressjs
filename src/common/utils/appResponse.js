/**
 * Sends a JSON response with a standardized format.
 *
 * @param {Object} res - Express response object.
 * @param {number} [statusCode=200] - HTTP status code for the response.
 * @param {any} data - Data to be included in the response payload.
 * @param {string} message - A descriptive message for the response.
 */

export function AppResponse(res, statusCode = 200, data, message) {
  res.status(statusCode).json({
    success: true,
    data: data ?? null,
    message: message ?? 'Success'
  });
}
