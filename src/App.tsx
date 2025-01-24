import React, { useState, useEffect } from 'react';
import { Users, RefreshCw, X, Circle, Trophy, History, Volume2, VolumeX, Settings, Copy, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSound from 'use-sound';
import { nanoid } from 'nanoid';
import { supabase } from './lib/supabase';

type Player = 'X' | 'O';
type Board = (Player | null)[];
type GameMode = 'local' | 'online' | null;
type GameHistory = {
  board: Board;
  winner: Player | 'Draw' | null;
  timestamp: Date;
};

interface PlayerInfo {
  name: string;
  score: number;
  symbol: Player;
}

interface OnlineGameState {
  roomCode: string;
  isHost: boolean;
  connected: boolean;
  playerId: string | null;
  errorMessage: string | null;
}

function App() {
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X');
  const [winner, setWinner] = useState<Player | 'Draw' | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>(null);
  const [players, setPlayers] = useState<{ [key in Player]: PlayerInfo }>({
    X: { name: 'Player 1', score: 0, symbol: 'X' },
    O: { name: 'Player 2', score: 0, symbol: 'O' }
  });
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [moveCount, setMoveCount] = useState(0);
  const [onlineGame, setOnlineGame] = useState<OnlineGameState | null>(null);
  const [joinCode, setJoinCode] = useState('');

  // Sound effects
  const [playMove] = useSound('/sounds/move.mp3', { volume: 0.5 });
  const [playWin] = useSound('/sounds/win.mp3', { volume: 0.5 });
  const [playDraw] = useSound('/sounds/draw.mp3', { volume: 0.5 });

  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  useEffect(() => {
    if (gameMode === 'online' && onlineGame?.roomCode) {
      const channel = supabase
        .channel(`room:${onlineGame.roomCode}`)
        .on('presence', { event: 'sync' }, () => {
          // Handle presence updates
        })
        .on('broadcast', { event: 'game_update' }, ({ payload }) => {
          setBoard(payload.board);
          setCurrentPlayer(payload.currentPlayer);
          setWinner(payload.winner);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [gameMode, onlineGame?.roomCode]);

  const createRoom = async () => {
    try {
      const { data: auth } = await supabase.auth.signUp({
        email: `${nanoid()}@temp.com`,
        password: nanoid()
      });

      if (!auth.user) throw new Error('Failed to create temporary user');

      const roomCode = nanoid(6).toUpperCase();
      const { data: room, error } = await supabase
        .from('game_rooms')
        .insert([
          {
            code: roomCode,
            host_id: auth.user.id,
            board: board,
            current_player: currentPlayer
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setOnlineGame({
        roomCode,
        isHost: true,
        connected: true,
        playerId: auth.user.id,
        errorMessage: null
      });
    } catch (error) {
      setOnlineGame(prev => ({
        ...prev!,
        errorMessage: 'Failed to create room'
      }));
    }
  };

  const joinRoom = async () => {
    if (!joinCode) return;

    try {
      const { data: auth } = await supabase.auth.signUp({
        email: `${nanoid()}@temp.com`,
        password: nanoid()
      });

      if (!auth.user) throw new Error('Failed to create temporary user');

      const { data: room, error } = await supabase
        .from('game_rooms')
        .update({ guest_id: auth.user.id, status: 'playing' })
        .eq('code', joinCode.toUpperCase())
        .eq('status', 'waiting')
        .is('guest_id', null)
        .select()
        .single();

      if (error || !room) {
        throw new Error('Invalid room code or room is full');
      }

      setOnlineGame({
        roomCode: joinCode.toUpperCase(),
        isHost: false,
        connected: true,
        playerId: auth.user.id,
        errorMessage: null
      });
    } catch (error) {
      setOnlineGame(prev => ({
        ...prev!,
        errorMessage: 'Failed to join room'
      }));
    }
  };

  const checkWinner = (squares: Board) => {
    for (const [a, b, c] of winningCombinations) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (squares.every(square => square !== null)) {
      return 'Draw';
    }
    return null;
  };

  const handleClick = async (index: number) => {
    if (board[index] || winner) return;

    if (gameMode === 'online' && !onlineGame?.connected) return;
    if (gameMode === 'online' && currentPlayer !== (onlineGame?.isHost ? 'X' : 'O')) return;

    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setMoveCount(prev => prev + 1);

    if (soundEnabled) {
      playMove();
    }

    const newWinner = checkWinner(newBoard);
    if (newWinner) {
      setWinner(newWinner);
      if (newWinner !== 'Draw') {
        setPlayers(prev => ({
          ...prev,
          [newWinner]: {
            ...prev[newWinner],
            score: prev[newWinner].score + 1
          }
        }));
        if (soundEnabled) {
          playWin();
        }
      } else if (soundEnabled) {
        playDraw();
      }

      setGameHistory(prev => [...prev, {
        board: newBoard,
        winner: newWinner,
        timestamp: new Date()
      }]);

      if (gameMode === 'online' && onlineGame?.roomCode) {
        await supabase
          .from('game_rooms')
          .update({
            board: newBoard,
            winner: newWinner,
            status: 'finished'
          })
          .eq('code', onlineGame.roomCode);
      }
    } else {
      const nextPlayer = currentPlayer === 'X' ? 'O' : 'X';
      setCurrentPlayer(nextPlayer);

      if (gameMode === 'online' && onlineGame?.roomCode) {
        await supabase
          .from('game_rooms')
          .update({
            board: newBoard,
            current_player: nextPlayer
          })
          .eq('code', onlineGame.roomCode);
      }
    }
  };

  const resetGame = async () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setWinner(null);
    setMoveCount(0);

    if (gameMode === 'online' && onlineGame?.roomCode) {
      await supabase
        .from('game_rooms')
        .update({
          board: Array(9).fill(null),
          current_player: 'X',
          winner: null,
          status: 'playing'
        })
        .eq('code', onlineGame.roomCode);
    }
  };

  const resetScores = () => {
    setPlayers({
      X: { ...players.X, score: 0 },
      O: { ...players.O, score: 0 }
    });
    setGameHistory([]);
  };

  const copyRoomCode = () => {
    if (onlineGame?.roomCode) {
      navigator.clipboard.writeText(onlineGame.roomCode);
    }
  };

  const renderSquare = (index: number) => {
    return (
      <motion.button
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={() => handleClick(index)}
        className={`w-24 h-24 border-2 border-gray-300 flex items-center justify-center text-4xl font-bold
          ${!board[index] && !winner ? 'hover:bg-gray-100' : ''}`}
        whileHover={!board[index] && !winner ? { scale: 1.05 } : {}}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence>
          {board[index] && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              {board[index] === 'X' ? (
                <X className="w-12 h-12 text-blue-500" />
              ) : (
                <Circle className="w-12 h-12 text-red-500" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    );
  };

  const renderOnlineSetup = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-gray-100 flex items-center justify-center"
    >
      <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
        <h1 className="text-3xl font-bold mb-8">Online Multiplayer</h1>
        {!onlineGame ? (
          <div className="space-y-6">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={createRoom}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-2"
            >
              Create Room
            </motion.button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter Room Code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={6}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={joinRoom}
                disabled={!joinCode}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogIn className="w-5 h-5" />
                Join Room
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">Room Code</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-mono">{onlineGame.roomCode}</span>
                <button
                  onClick={copyRoomCode}
                  className="p-2 hover:bg-gray-200 rounded-lg"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
            </div>
            {onlineGame.errorMessage && (
              <div className="bg-red-100 text-red-700 p-4 rounded-lg">
                {onlineGame.errorMessage}
              </div>
            )}
            <div className="text-gray-600">
              {onlineGame.isHost ? (
                "Waiting for opponent to join..."
              ) : (
                "Connected! Game will start soon..."
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );

  const renderGameMode = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-gray-100 flex items-center justify-center"
    >
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <motion.h1
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-4xl font-bold mb-8 text-gray-800"
        >
          Tic Tac Toe
        </motion.h1>
        <div className="space-y-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setGameMode('local')}
            className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-2 shadow-md"
          >
            <Users className="w-5 h-5" />
            Local Multiplayer
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setGameMode('online')}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 flex items-center justify-center gap-2 shadow-md"
          >
            <Users className="w-5 h-5" />
            Online Multiplayer
          </motion.button>
        </div>
      </div>
    </motion.div>
  );

  const renderGame = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-100 flex items-center justify-center p-4"
    >
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl w-full">
        <div className="flex justify-between items-center mb-8">
          <motion.h1
            initial={{ x: -20 }}
            animate={{ x: 0 }}
            className="text-3xl font-bold text-gray-800"
          >
            Tic Tac Toe
          </motion.h1>
          <div className="flex gap-4">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <History />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <Settings />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="grid grid-cols-3 gap-2 mb-8">
              {Array(9).fill(null).map((_, i) => renderSquare(i))}
            </div>

            <div className="flex justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={resetGame}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                New Game
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={resetScores}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                Reset Scores
              </motion.button>
            </div>
          </div>

          <div className="space-y-6">
            {gameMode === 'online' && onlineGame && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">Room Info</h2>
                <div className="flex items-center justify-between">
                  <span>Code: {onlineGame.roomCode}</span>
                  <button
                    onClick={copyRoomCode}
                    className="p-2 hover:bg-gray-200 rounded-lg"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  You are {onlineGame.isHost ? 'X (Host)' : 'O (Guest)'}
                </p>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Game Status</h2>
              {!winner && (
                <div className="flex items-center gap-2">
                  <span>Current Player:</span>
                  {currentPlayer === 'X' ? (
                    <X className="w-6 h-6 text-blue-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-red-500" />
                  )}
                  <span>({players[currentPlayer].name})</span>
                </div>
              )}
              {winner && (
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="text-lg font-semibold"
                >
                  {winner === 'Draw' ? (
                    "It's a Draw!"
                  ) : (
                    <div className="flex items-center gap-2">
                      Winner: {players[winner].name}
                      {winner === 'X' ? (
                        <X className="w-6 h-6 text-blue-500" />
                      ) : (
                        <Circle className="w-6 h-6 text-red-500" />
                      )}
                    </div>
                  )}
                </motion.div>
              )}
              <div className="mt-4">
                <p>Moves: {moveCount}</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Scoreboard</h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <X className="w-5 h-5 text-blue-500" />
                    {players.X.name}
                  </div>
                  <span className="font-bold">{players.X.score}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Circle className="w-5 h-5 text-red-500" />
                    {players.O.name}
                  </div>
                  <span className="font-bold">{players.O.score}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="bg-white p-6 rounded-lg max-w-md w-full m-4"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-2xl font-bold mb-4">Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Player X Name
                    </label>
                    <input
                      type="text"
                      value={players.X.name}
                      onChange={e => setPlayers(prev => ({
                        ...prev,
                        X: { ...prev.X, name: e.target.value }
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Player O Name
                    </label>
                    <input
                      type="text"
                      value={players.O.name}
                      onChange={e => setPlayers(prev => ({
                        ...prev,
                        O: { ...prev.O, name: e.target.value }
                      }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Sound Effects</span>
                    <button
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`p-2 rounded-lg ${soundEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                    >
                      {soundEnabled ? <Volume2 /> : <VolumeX />}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
              onClick={() => setShowHistory(false)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="bg-white p-6 rounded-lg max-w-md w-full m-4"
                onClick={e => e.stopPropagation()}
              >
                <h2 className="text-2xl font-bold mb-4">Game History</h2>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {gameHistory.map((game, index) => (
                    <div key={index} className="border-b pb-4">
                      <p className="font-semibold">
                        Game {gameHistory.length - index}
                      </p>
                      <p>
                        Result:{' '}
                        {game.winner === 'Draw'
                          ? "Draw"
                          : `Winner: ${players[game.winner as Player].name}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(game.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  if (gameMode === 'online' && (!onlineGame || !onlineGame.connected)) {
    return renderOnlineSetup();
  }

  return gameMode ? renderGame() : renderGameMode(); }

export default App;