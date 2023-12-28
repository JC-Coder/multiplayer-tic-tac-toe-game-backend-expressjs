import { Router } from 'express';

const router = Router();
import { userRoutes } from './user.route.js';
import { gameRoutes } from './game.route.js';

export const setRoutes = () => {
  router.use('/user', userRoutes());
  router.use('/game', gameRoutes());
  return router;
};
