import { Injectable } from '@nestjs/common';
import { GameRoom } from './types/game.types';

@Injectable()
export class GameRoomStore {
  /** roomCode → GameRoom */
  private readonly rooms = new Map<string, GameRoom>();
  /** socketId → roomCode */
  private readonly socketToRoom = new Map<string, string>();
  /** userId → roomCode */
  private readonly userToRoom = new Map<number, string>();
  /** Generate a unique 6-character room code. */
  generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes ambiguous I/O/0/1
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(roomCode: string): GameRoom {
    const room: GameRoom = {
      roomCode,
      players: new Map(),
      state: 'waiting',
      currentRound: 0,
      totalRounds: 3,
      roundDurationMs: 5500,
      scores: new Map(),
      roundRecords: [],
      roundTimer: null,
      micReady: new Map(),
      prepareTimer: null,
      ttlTimer: null,
      officialRoundStarted: false,
      prepareDeadlineAt: null,
      createdAt: new Date(),
    };
    this.rooms.set(roomCode, room);
    return room;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode);
  }

  deleteRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  registerSocket(socketId: string, roomCode: string): void {
    this.socketToRoom.set(socketId, roomCode);
  }

  removeSocket(socketId: string): void {
    this.socketToRoom.delete(socketId);
  }

  getRoomBySocketId(socketId: string): GameRoom | undefined {
    const roomCode = this.socketToRoom.get(socketId);
    return roomCode ? this.rooms.get(roomCode) : undefined;
  }

  registerUser(userId: number, roomCode: string): void {
    this.userToRoom.set(userId, roomCode);
  }

  removeUser(userId: number): void {
    this.userToRoom.delete(userId);
  }

  getRoomByUserId(userId: number): GameRoom | undefined {
    const roomCode = this.userToRoom.get(userId);
    return roomCode ? this.rooms.get(roomCode) : undefined;
  }
}
