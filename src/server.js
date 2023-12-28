import { ENVIRONMENT } from './common/config/environment.js';
import express from 'express';
import AppError from './common/utils/appError.js';
import { setRoutes } from './modules/routes/index.js';
import {
  catchAsync,
  handleError,
  timeoutMiddleware
} from './common/utils/errorHandler.js';
import cors from 'cors';
import helmet from 'helmet';
import { stream } from './common/utils/logger.js';
import morgan from 'morgan';
import { connectDb } from './common/config/database.js';
import { validateEnvs } from './common/validators/index.js';

// Add the following imports for Socket.IO
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

/**
 * Default app configurations
 */
export const app = express();
const port = ENVIRONMENT.APP.PORT;

// Create an HTTP server and attach Socket.IO
const server = http.createServer(app);
export const io = new SocketIOServer(server, {
  cors: {
    origin: '*'
  }
});

const games = new Map();

const removeGameBySocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    if (creator === socketId || opponent === socketId) {
      games.delete(gameId);
      console.log(`Game ${gameId} removed`);
    }
  }
};

const getGameIdBySocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    if (creator === socketId || opponent === socketId) {
      return gameId;
    }
  }
};

const getOppositeSocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    if (creator === socketId) {
      return opponent;
    } else if (opponent === socketId) {
      return creator;
    }
  }
};

const getParticipantsBySocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    if (creator === socketId || opponent === socketId) {
      return [creator, opponent];
    }
  }
  return null; // Return null if no matching gameId is found
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected', socket.id);
  socket.emit('connected');

  // create game
  socket.on('createGame', (data) => {
    const name = data.name;
    console.log('createGame input', { data });

    if (!name || name.length < 2) {
      return socket.emit('createGameRes', {
        success: false,
        message: 'invalid game name '
      });
    }

    if (games.get(data.name)) {
      return socket.emit('createGameRes', {
        success: false,
        message: 'game already exist'
      });
    }

    games.set(data.name, {
      creator: socket.id,
      opponent: null
    });

    console.log({ games });

    socket.join(name);
    io.to(name).emit('createGameRes', 'room broadcast');
    socket.emit('createGameRes', {
      success: true,
      data: games
    });
  });

  // join game
  socket.on('joinGame', (data) => {
    const name = data.name;
    console.log('join game input ', name);

    let game = games.get(name);
    if (!game) {
      return socket.emit('joinGameRes', {
        success: false,
        message: 'game does not exist'
      });
    }

    if (game.creator === socket.id) {
      return socket.emit('joinGameRes', {
        success: false,
        message: 'you cannot join game created by you'
      });
    }

    games.set(name, {
      ...game,
      opponent: socket.id
    });

    console.log({ games });

    socket.join(name);
    io.to(name).emit('opponentJoinGame', {
      success: true
    });
    socket.emit('joinGameRes', {
      success: true,
      data: games
    });

    // set starting player
    const players = ['x', 'o'];
    const randomIndex = Math.floor(Math.random() * players.length);
    const gameId = getGameIdBySocketId(socket.id);
    io.to(gameId).emit('currentPlayer', players[randomIndex]);
    game = games.get(gameId);
    console.log('game', game);
    console.log('game creator', game.creator);
    io.to(gameId).emit('gameStart');
    io.to(game.creator).emit('startPlayer');
  });

  // toggle
  socket.on('toggle', (data) => {
    console.log('toggle', data);
    const oppositeSocketId = getOppositeSocketId(socket.id);

    io.to(oppositeSocketId).emit('toggle', data);
  });

  // set current player
  socket.on('currentPlayer', (data) => {
    console.log('curr player', data);
    const gameId = getGameIdBySocketId(socket.id);

    let newData = data === 'o' ? 'o' : 'x';

    io.to(gameId).emit('currentPlayer', newData);
  });

  // next game
  socket.on('nextGame', () => {
    const oppositeSocketId = getOppositeSocketId(socket.id);
    io.to(oppositeSocketId).emit('nextGame');

    const participants = getParticipantsBySocketId(socket.id);
    const randomIndex = Math.floor(Math.random() * participants.length);
    io.to(participants[randomIndex]).emit('startPlayer');
  });

  socket.on('endGame', () => {
    const oppositeSocketId = getOppositeSocketId(socket.id);
    io.to(oppositeSocketId).emit('endGame');
  });

  // Disconnect event
  socket.on('disconnect', () => {
    console.log('User disconnected ====== ', socket.id);
  });
});

/**
 * App Security
 */
app.use(helmet());
app.use(
  cors({
    origin: '*'
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.disable('x-powered-by');
// app.use(compression());

/**
 * Logger Middleware
 */
app.use(
  morgan(ENVIRONMENT.APP.ENV !== 'local' ? 'combined' : 'dev', { stream })
);

// append request time to all request
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

/**
 * Initialize routes
 */
app.use('/', setRoutes());

// catch 404 and forward to error handler
app.all(
  '*',
  catchAsync(async (req, res) => {
    throw new AppError('route not found', 404);
  })
);

/**
 * Error handler middlewares
 */
app.use(timeoutMiddleware);
app.use(handleError);

/**
 * status check
 */
app.get('*', (req, res) =>
  res.send({
    Time: new Date(),
    status: 'running'
  })
);

/**
 * Bootstrap server
 */
validateEnvs();
server.listen(port, () => {
  console.log(
    '\n🎉🎉🎉🎉🎉🎉 App successfully started on port : ' + port + '  🎉🎉🎉🎉🎉'
  );
  connectDb();
});
