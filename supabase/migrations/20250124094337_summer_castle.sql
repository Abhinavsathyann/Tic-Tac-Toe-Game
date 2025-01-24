/*
  # Game Rooms Schema

  1. New Tables
    - `game_rooms`
      - `id` (uuid, primary key)
      - `code` (text, unique) - 6-digit room code
      - `host_id` (uuid) - ID of the host player
      - `guest_id` (uuid, nullable) - ID of the guest player
      - `board` (jsonb) - Current game board state
      - `current_player` (text) - Current player's symbol (X or O)
      - `winner` (text, nullable) - Winner's symbol or 'draw'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `status` (text) - Room status (waiting, playing, finished)

  2. Security
    - Enable RLS on `game_rooms` table
    - Add policies for room creation and joining
*/

CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  host_id uuid NOT NULL,
  guest_id uuid,
  board jsonb NOT NULL DEFAULT '[]',
  current_player text NOT NULL DEFAULT 'X',
  winner text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'waiting'
);

ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create a room
CREATE POLICY "Anyone can create a room"
  ON game_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow players to view their rooms
CREATE POLICY "Players can view their rooms"
  ON game_rooms
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = host_id OR 
    auth.uid() = guest_id OR
    (guest_id IS NULL AND status = 'waiting')
  );

-- Allow players to update their rooms
CREATE POLICY "Players can update their rooms"
  ON game_rooms
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id OR auth.uid() = guest_id)
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);