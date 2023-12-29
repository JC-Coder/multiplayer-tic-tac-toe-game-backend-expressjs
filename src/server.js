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
    if (creator.socket === socketId || opponent.socket === socketId) {
      return gameId;
    }
  }
};

const getOppositeSocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    if (creator.socket === socketId) {
      return opponent.socket;
    } else if (opponent.socket === socketId) {
      return creator.socket;
    }
  }
};

const getParticipantsBySocketId = (socketId) => {
  for (const [gameId, { creator, opponent }] of games.entries()) {
    console.log({ gameId, creator, opponent });
    if (creator.socket === socketId || opponent.socket === socketId) {
      return [creator, opponent];
    }
  }
  return null; // Return null if no matching gameId is found
};

const getRandomXorO = () => {
  const data = ['x', 'o'];
  const randomIndex = Math.floor(Math.random() * data.length);
  return data[randomIndex];
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

    const creatorGameId = getRandomXorO();
    games.set(data.name, {
      creator: {
        socket: socket.id,
        gameId: creatorGameId
      },
      opponent: {
        socket: null,
        gameId: creatorGameId === 'x' ? 'o' : 'x'
      }
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

    if (game) {
      if (game.creator.socket && game.opponent.socket) {
        return socket.emit('joinGameRes', {
          success: false,
          message: 'Game in progress'
        });
      }
    }

    if (game.creator.socket === socket.id) {
      return socket.emit('joinGameRes', {
        success: false,
        message: 'you cannot join game created by you'
      });
    }

    games.set(name, {
      ...game,
      opponent: {
        ...game.opponent,
        socket: socket.id
      }
    });

    console.log({ games });

    // join game
    socket.join(name);
    io.to(name).emit('opponentJoinGame', {
      success: true
    });
    io.to(name).emit('joinGameRes', {
      success: true,
      data: games
    });

    // set starting player
    const gameId = getGameIdBySocketId(socket.id);
    game = games.get(gameId);
    console.log('game', game);

    const participants = getParticipantsBySocketId(socket.id);
    console.log('participants', participants);
    setTimeout(() => {
      io.to(game.creator.socket).emit('setPlayer', game.creator.gameId);
      io.to(game.opponent.socket).emit('setPlayer', game.opponent.gameId);

      const randomXorO = getRandomXorO();
      io.to(
        participants.filter(
          (participant) => participant.gameId === randomXorO
        )[0].socket
      ).emit('startingPlayer');
    }, 200);
  });

  // toggle
  socket.on('toggle', (data) => {
    console.log('toggle', data);
    const oppositeSocketId = getOppositeSocketId(socket.id);

    io.to(oppositeSocketId).emit('toggle', data);
  });

  // next player
  socket.on('nextPlayer', () => {
    console.log('nextPlayer');
    const oppositeSocketId = getOppositeSocketId(socket.id);

    io.to(oppositeSocketId).emit('startingPlayer');
  });

  // next game
  socket.on('nextGame', (data) => {
    console.log('nextGame', data);
    const oppositeSocketId = getOppositeSocketId(socket.id);
    io.to(oppositeSocketId).emit('nextGame');

    const participants = getParticipantsBySocketId(socket.id);
    io.to(
      participants.filter((participant) => participant.gameId !== data)[0]
        .socket
    ).emit('startingPlayer');
  });

  socket.on('endGame', () => {
    const oppositeSocketId = getOppositeSocketId(socket.id);
    io.to(oppositeSocketId).emit('endGame');

    const gameId = getGameIdBySocketId(socket.id);
    games.delete(gameId);
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
