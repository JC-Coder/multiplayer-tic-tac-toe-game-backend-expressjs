import { Router } from 'express';
import { createGame } from '../controllers/game.controller.js';

const router = Router();

export const gameRoutes = () => {
  router.post('/', createGame);

  return router;
};
