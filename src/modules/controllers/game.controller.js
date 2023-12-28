import AppError from '../../common/utils/appError.js';
import { AppResponse } from '../../common/utils/appResponse.js';
import { catchAsync } from '../../common/utils/errorHandler.js';

const games = new Map();

export const createGame = catchAsync(async (req, res) => {
  const { name } = req.body;
  console.log('create game ', req.body);

  games.set(name, {
    players: ['1', '2']
  });

  const game = games.get(name);

  return AppResponse(res, 201, game, 'game created successfully');
});
