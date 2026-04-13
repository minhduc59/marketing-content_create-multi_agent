import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AiServiceClient } from '../ai-service/ai-service.client';

interface AuthedSocket extends Socket {
  data: {
    userId?: string;
    email?: string;
    role?: 'admin' | 'user';
    subscriptions?: Set<string>; // `scan:<id>` | `publish:<id>`
  };
}

/**
 * WebSocket status gateway.
 *
 * - JWT authenticated via handshake `auth.token` (or `?token=` fallback).
 * - Clients subscribe to rooms:  `scan:<scanId>` or `publish:<publishId>`.
 * - The gateway polls ai-service every `POLL_INTERVAL_MS` for each
 *   actively-subscribed room and emits events:
 *     - `scan.progress`        — while scan is still running
 *     - `scan.completed`       — once terminal status is reached
 *     - `publish.status_changed` — on any publish status change
 *
 * This lets the frontend show live progress without polling itself.
 * For v2 we'd swap the polling loop for a Redis pub/sub subscription.
 */
@WebSocketGateway({ namespace: '/ws', cors: { origin: true, credentials: true } })
export class StatusGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(StatusGateway.name);
  private static readonly POLL_INTERVAL_MS = 2_000;

  @WebSocketServer() server!: Server;

  /** roomId -> setInterval handle */
  private readonly pollers = new Map<string, NodeJS.Timeout>();
  /** roomId -> last known status (used to decide whether to emit) */
  private readonly lastStatus = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly ai: AiServiceClient,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        role: 'admin' | 'user';
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      client.data.role = payload.role;
      client.data.subscriptions = new Set();
      this.logger.log(`ws connected: ${payload.email}`);
    } catch (err) {
      this.logger.warn(`ws auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const rooms = client.data.subscriptions ?? new Set<string>();
    for (const room of rooms) this.maybeStopPolling(room);
  }

  @SubscribeMessage('subscribe')
  subscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { resource: 'scan' | 'publish'; id: string },
  ) {
    if (!payload?.resource || !payload?.id) return { ok: false };
    const room = `${payload.resource}:${payload.id}`;
    client.join(room);
    client.data.subscriptions?.add(room);
    this.ensurePolling(room, client.data.userId!);
    return { ok: true, room };
  }

  @SubscribeMessage('unsubscribe')
  unsubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { resource: 'scan' | 'publish'; id: string },
  ) {
    if (!payload?.resource || !payload?.id) return { ok: false };
    const room = `${payload.resource}:${payload.id}`;
    client.leave(room);
    client.data.subscriptions?.delete(room);
    this.maybeStopPolling(room);
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Polling management — one interval per subscribed room. When the last
  // subscriber leaves, we stop the interval to avoid wasted traffic.
  // ---------------------------------------------------------------------

  private ensurePolling(room: string, userId: string): void {
    if (this.pollers.has(room)) return;
    const handle = setInterval(async () => {
      try {
        await this.tick(room, userId);
      } catch (err) {
        this.logger.warn(`poll ${room} failed: ${(err as Error).message}`);
      }
    }, StatusGateway.POLL_INTERVAL_MS);
    this.pollers.set(room, handle);
  }

  private maybeStopPolling(room: string): void {
    const stillSubscribed =
      (this.server.sockets.adapter.rooms.get(room)?.size ?? 0) > 0;
    if (stillSubscribed) return;
    const handle = this.pollers.get(room);
    if (handle) {
      clearInterval(handle);
      this.pollers.delete(room);
      this.lastStatus.delete(room);
    }
  }

  private async tick(room: string, userId: string): Promise<void> {
    const [kind, id] = room.split(':');
    if (kind === 'scan') {
      const status = (await this.ai.getScanStatus(userId, id)) as {
        status: string;
      };
      if (this.lastStatus.get(room) !== status.status) {
        this.lastStatus.set(room, status.status);
        this.server.to(room).emit('scan.progress', status);
      }
      if (['completed', 'partial', 'failed'].includes(status.status)) {
        this.server.to(room).emit('scan.completed', status);
        const handle = this.pollers.get(room);
        if (handle) {
          clearInterval(handle);
          this.pollers.delete(room);
        }
      }
    } else if (kind === 'publish') {
      const status = (await this.ai.getPublishStatus(userId, id)) as {
        status: string;
      };
      if (this.lastStatus.get(room) !== status.status) {
        this.lastStatus.set(room, status.status);
        this.server.to(room).emit('publish.status_changed', status);
      }
      if (['published', 'failed', 'cancelled'].includes(status.status)) {
        const handle = this.pollers.get(room);
        if (handle) {
          clearInterval(handle);
          this.pollers.delete(room);
        }
      }
    }
  }
}
