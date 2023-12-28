import AppError from '../../common/utils/appError.js';
import { AppResponse } from '../../common/utils/appResponse.js';
import { catchAsync } from '../../common/utils/errorHandler.js';

export const getUser = catchAsync(async (req, res) => {
  const user = {
    name: 'jc',
    email: 'coder'
  };

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return AppResponse(res, 200, user, 'Data retrieved successfully');
});
