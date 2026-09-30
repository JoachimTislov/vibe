/**
 * Distributed Transpilation Network for Universal Transpiler
 * 
 * Phase 3: Distributed computation and collaborative learning
 * 
 * Features:
 * - Peer-to-peer transpilation sharing
 * - Distributed cache
 * - Collaborative learning
 * - Load balancing
 * - Fault tolerance
 */

import type { 
  TranspileOptions,
  TranspileResult,
  Parser,
  CacheManager,
  CacheEntry,
} from '../core/universal-transpiler';
import * as crypto from 'crypto';

// ============================================================================
// Network Types
// ============================================================================

export interface PeerInfo {
  id: string;
  address: string;
  port: number;
  capabilities: string[];
  lastSeen: number;
  version: string;
  language?: string;
  region?: string;
}

export interface NetworkMessage {
  type: 'transpile' | 'cache_get' | 'cache_set' | 'parser_request' | 'learn' | 'ping' | 'pong' | 'error';
  id: string;
  from: string;
  to?: string;
  data?: any;
  timestamp: number;
  ttl: number;
}

export interface TranspileRequest {
  source: string;
  options: TranspileOptions;
  sourceLanguage?: string;
  targetLanguage: string;
}

export interface TranspileResponse {
  result?: TranspileResult;
  error?: string;
  cached?: boolean;
  peer?: string;
}

export interface CacheRequest {
  key: string;
  type: 'get' | 'set' | 'delete' | 'list';
  value?: any;
  ttl?: number;
  metadata?: any;
}

export interface CacheResponse {
  success: boolean;
  value?: any;
  entries?: CacheEntry[];
  error?: string;
  ttl?: number;
  metadata?: any;
}

export interface ParserRequest {
  language: string;
  samples?: string[];
}

export interface ParserResponse {
  parser?: Parser;
  error?: string;
  language: string;
}

export interface LearnRequest {
  type: 'parser' | 'transform' | 'compiler' | 'domain';
  name: string;
  data: any;
  source?: string;
}

export interface LearnResponse {
  success: boolean;
  error?: string;
  id?: string;
}

export interface NetworkConfig {
  peerId?: string;
  address?: string;
  port?: number;
  broadcastAddress?: string;
  broadcastPort?: number;
  peers?: string[];
  capabilities?: string[];
  maxPeers?: number;
  cacheReplication?: number;
  learnFromPeers?: boolean;
  shareParsers?: boolean;
  timeout?: number;
}

// ============================================================================
// Network Constants
// ============================================================================

const DEFAULT_PORT = 3000;
const DEFAULT_BROADCAST_PORT = 3001;
const DEFAULT_TIMEOUT = 5000;
const MESSAGE_TTL = 10; // hops
const PING_INTERVAL = 10000; // 10 seconds
const PEER_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Peer Discovery
// ============================================================================

/**
 * Peer discovery using multicast UDP
 */
export class PeerDiscovery {
  private peerId: string;
  private address: string;
  private port: number;
  private broadcastAddress: string;
  private broadcastPort: number;
  private peers: Map<string, PeerInfo> = new Map();
  private socket: any = null;
  private running = false;
  private onPeerDiscovered: (peer: PeerInfo) => void = () => {};
  private onPeerLost: (peerId: string) => void = () => {};

  constructor(config: NetworkConfig) {
    this.peerId = config.peerId || this.generatePeerId();
    this.address = config.address || '0.0.0.0';
    this.port = config.port || DEFAULT_PORT;
    this.broadcastAddress = config.broadcastAddress || '255.255.255.255';
    this.broadcastPort = config.broadcastPort || DEFAULT_BROADCAST_PORT;
  }

  private generatePeerId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async start(): Promise<void> {
    if (this.running) return;
    
    this.running = true;
    
    // Create UDP socket for peer discovery
    try {
      const dgram = await import('dgram');
      this.socket = dgram.createSocket('udp4');
      
      this.socket.on('message', (msg: Buffer, rinfo: any) => {
        try {
          const message = JSON.parse(msg.toString()) as NetworkMessage;
          
          if (message.type === 'ping') {
            this.handlePing(message, rinfo);
          } else if (message.type === 'pong') {
            this.handlePong(message, rinfo);
          }
        } catch {
          // Ignore invalid messages
        }
      });
      
      this.socket.on('error', (err: Error) => {
        console.error('Peer discovery error:', err.message);
      });
      
      this.socket.bind(this.port);
      
      // Start broadcasting
      this.startBroadcasting();
      
      // Start peer timeout checker
      this.startPeerTimeoutChecker();
      
      console.log(`Peer discovery started on port ${this.port}`);
    } catch (error) {
      console.error('Failed to start peer discovery:', error);
      this.running = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    
    this.running = false;
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.peers.clear();
    console.log('Peer discovery stopped');
  }

  private startBroadcasting(): void {
    // Broadcast ping message every PING_INTERVAL
    const broadcast = () => {
      if (!this.running) return;
      
      const message: NetworkMessage = {
        type: 'ping',
        id: this.generateMessageId(),
        from: this.peerId,
        data: {
          id: this.peerId,
          address: this.address,
          port: this.port,
          capabilities: [], // TODO: Add capabilities
          version: '1.0.0',
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
        ttl: MESSAGE_TTL,
      };
      
      const buffer = Buffer.from(JSON.stringify(message));
      
      try {
        this.socket.send(buffer, 0, buffer.length, this.broadcastPort, this.broadcastAddress);
      } catch {
        // Ignore send errors
      }
    };
    
    // Initial broadcast
    broadcast();
    
    // Periodic broadcast
    setInterval(broadcast, PING_INTERVAL);
  }

  private startPeerTimeoutChecker(): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = PEER_TIMEOUT;
      
      for (const [id, peer] of this.peers) {
        if (now - peer.lastSeen > timeout) {
          this.peers.delete(id);
          this.onPeerLost(id);
        }
      }
    }, PEER_TIMEOUT / 2);
  }

  private handlePing(message: NetworkMessage, rinfo: any): void {
    // Respond to ping
    const pong: NetworkMessage = {
      type: 'pong',
      id: this.generateMessageId(),
      from: this.peerId,
      to: message.from,
      data: {
        id: this.peerId,
        address: this.address,
        port: this.port,
        capabilities: [],
        version: '1.0.0',
      },
      timestamp: Date.now(),
      ttl: MESSAGE_TTL,
    };
    
    const buffer = Buffer.from(JSON.stringify(pong));
    this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address);
    
    // Add or update peer
    this.addPeer({
      id: message.from,
      address: rinfo.address,
      port: rinfo.port,
      capabilities: message.data?.capabilities || [],
      lastSeen: Date.now(),
      version: message.data?.version || '1.0.0',
    });
  }

  private handlePong(message: NetworkMessage, rinfo: any): void {
    // Add or update peer
    this.addPeer({
      id: message.from,
      address: rinfo.address,
      port: rinfo.port,
      capabilities: message.data?.capabilities || [],
      lastSeen: Date.now(),
      version: message.data?.version || '1.0.0',
    });
  }

  private addPeer(peer: PeerInfo): void {
    const existing = this.peers.get(peer.id);
    
    if (!existing) {
      this.peers.set(peer.id, peer);
      this.onPeerDiscovered(peer);
    } else {
      // Update existing peer
      this.peers.set(peer.id, {
        ...existing,
        ...peer,
        lastSeen: Date.now(),
      });
    }
  }

  private generateMessageId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  getPeer(id: string): PeerInfo | undefined {
    return this.peers.get(id);
  }

  onDiscovered(callback: (peer: PeerInfo) => void): void {
    this.onPeerDiscovered = callback;
  }

  onLost(callback: (peerId: string) => void): void {
    this.onPeerLost = callback;
  }
}

// ============================================================================
// Distributed Cache
// ============================================================================

/**
 * Distributed cache that replicates across peers
 */
export class DistributedCache {
  private localCache: CacheManager;
  private peerDiscovery: PeerDiscovery;
  private replicationFactor: number;
  private peerId: string;

  constructor(
    localCache: CacheManager,
    peerDiscovery: PeerDiscovery,
    replicationFactor: number = 2
  ) {
    this.localCache = localCache;
    this.peerDiscovery = peerDiscovery;
    this.replicationFactor = replicationFactor;
    this.peerId = peerDiscovery['peerId'];
  }

  async get<T>(key: string): Promise<T | null> {
    // Try local cache first
    const local = this.localCache.get<T>(key);
    if (local !== null) {
      return local;
    }
    
    // Try to get from peers
    const peers = this.peerDiscovery.getPeers();
    
    for (const peer of peers) {
      try {
        const result = await this.fetchFromPeer(peer, {
          type: 'get',
          key,
        });
        
        if (result?.success && result.value) {
          // Cache locally
          this.localCache.set(key, result.value, result.ttl, result.metadata);
          return result.value as T;
        }
      } catch {
        // Ignore peer errors
      }
    }
    
    return null;
  }

  async set(key: string, value: any, ttl?: number, metadata?: any): Promise<void> {
    // Set locally
    await this.localCache.set(key, value, ttl, metadata);
    
    // Replicate to peers
    const peers = this.peerDiscovery.getPeers();
    const targets = this.selectPeersForReplication(peers, key);
    
    for (const peer of targets) {
      try {
        await this.fetchFromPeer(peer, {
          type: 'set',
          key,
          value,
          ttl,
          metadata,
        });
      } catch {
        // Ignore peer errors
      }
    }
  }

  async delete(key: string): Promise<void> {
    // Delete locally
    await this.localCache.delete(key);
    
    // Delete from peers (best effort)
    const peers = this.peerDiscovery.getPeers();
    
    for (const peer of peers) {
      try {
        await this.fetchFromPeer(peer, {
          type: 'delete',
          key,
        });
      } catch {
        // Ignore peer errors
      }
    }
  }

  async list(pattern?: string): Promise<CacheEntry[]> {
    const local = await this.localCache.list(pattern);
    
    // Try to get from peers
    const peers = this.peerDiscovery.getPeers();
    
    for (const peer of peers) {
      try {
        const result = await this.fetchFromPeer(peer, {
          type: 'list',
          key: pattern || '',
        });
        
        if (result?.success && result.entries) {
          // Merge with local results
          for (const entry of result.entries) {
            if (!local.some(e => e.key === entry.key)) {
              local.push(entry);
            }
          }
        }
      } catch {
        // Ignore peer errors
      }
    }
    
    return local;
  }

  private selectPeersForReplication(peers: PeerInfo[], key: string): PeerInfo[] {
    // Simple selection: first N peers
    // In production, would use consistent hashing
    const hash = this.hashKey(key);
    const sortedPeers = [...peers].sort((a, b) => {
      const aHash = this.hashKey(a.id);
      const bHash = this.hashKey(b.id);
      return Math.abs(aHash - hash) - Math.abs(bHash - hash);
    });
    
    return sortedPeers.slice(0, this.replicationFactor);
  }

  private hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async fetchFromPeer(peer: PeerInfo, request: CacheRequest): Promise<CacheResponse | null> {
    try {
      const response = await fetch(`http://${peer.address}:${peer.port}/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': this.peerId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      
      if (!response.ok) {
        return null;
      }
      
      return response.json();
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Collaborative Learning
// ============================================================================

/**
 * Collaborative learning system for sharing knowledge between peers
 */
export class CollaborativeLearning {
  private peerDiscovery: PeerDiscovery;
  private learnedItems: Map<string, { data: any; source: string; timestamp: number }> = new Map();
  private peerId: string;
  private shareParsers: boolean;
  private learnFromPeers: boolean;

  constructor(
    peerDiscovery: PeerDiscovery,
    options: {
      shareParsers?: boolean;
      learnFromPeers?: boolean;
    } = {}
  ) {
    this.peerDiscovery = peerDiscovery;
    this.peerId = peerDiscovery['peerId'];
    this.shareParsers = options.shareParsers !== false;
    this.learnFromPeers = options.learnFromPeers !== false;
    
    // Listen for new peers
    peerDiscovery.onDiscovered((peer) => {
      this.syncWithPeer(peer);
    });
  }

  async learn(itemType: string, name: string, data: any, source?: string): Promise<string> {
    const id = this.generateLearnId(itemType, name);
    
    this.learnedItems.set(id, {
      data,
      source: source || this.peerId,
      timestamp: Date.now(),
    });
    
    // Share with peers if enabled
    if (this.shareParsers) {
      await this.shareWithPeers(itemType, name, data);
    }
    
    return id;
  }

  async get(itemType: string, name: string): Promise<any | null> {
    const id = this.generateLearnId(itemType, name);
    const local = this.learnedItems.get(id);
    
    if (local) {
      return local.data;
    }
    
    // Try to get from peers
    if (this.learnFromPeers) {
      const peers = this.peerDiscovery.getPeers();
      
      for (const peer of peers) {
        try {
          const result = await this.fetchLearnFromPeer(peer, itemType, name);
          if (result) {
            this.learnedItems.set(id, {
              data: result,
              source: peer.id,
              timestamp: Date.now(),
            });
            return result;
          }
        } catch {
          // Ignore peer errors
        }
      }
    }
    
    return null;
  }

  async list(itemType?: string): Promise<{ id: string; type: string; name: string; data: any; source: string; timestamp: number }[]> {
    const results: any[] = [];
    
    for (const [id, item] of this.learnedItems) {
      if (!itemType || id.startsWith(`${itemType}:`)) {
        const [type, name] = id.split(':', 2);
        results.push({
          id,
          type,
          name,
          data: item.data,
          source: item.source,
          timestamp: item.timestamp,
        });
      }
    }
    
    return results;
  }

  async shareWithPeers(itemType: string, name: string, data: any): Promise<void> {
    const peers = this.peerDiscovery.getPeers();
    const learnRequest: LearnRequest = {
      type: itemType as any,
      name,
      data,
      source: this.peerId,
    };
    
    for (const peer of peers) {
      try {
        await this.fetchLearnRequest(peer, learnRequest);
      } catch {
        // Ignore peer errors
      }
    }
  }

  private async syncWithPeer(peer: PeerInfo): Promise<void> {
    try {
      const response = await fetch(`http://${peer.address}:${peer.port}/learn/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': this.peerId,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      
      if (!response.ok) {
        return;
      }
      
      const items = await response.json();
      
      for (const item of items) {
        const id = this.generateLearnId(item.type, item.name);
        if (!this.learnedItems.has(id)) {
          this.learnedItems.set(id, {
            data: item.data,
            source: peer.id,
            timestamp: Date.now(),
          });
        }
      }
    } catch {
      // Ignore sync errors
    }
  }

  private async fetchLearnFromPeer(peer: PeerInfo, itemType: string, name: string): Promise<any | null> {
    try {
      const response = await fetch(`http://${peer.address}:${peer.port}/learn/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': this.peerId,
        },
        body: JSON.stringify({ type: itemType, name }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const result = await response.json();
      return result?.data || null;
    } catch {
      return null;
    }
  }

  private async fetchLearnRequest(peer: PeerInfo, request: LearnRequest): Promise<LearnResponse | null> {
    try {
      const response = await fetch(`http://${peer.address}:${peer.port}/learn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Peer-Id': this.peerId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      
      if (!response.ok) {
        return null;
      }
      
      return response.json();
    } catch {
      return null;
    }
  }

  private generateLearnId(type: string, name: string): string {
    return `${type}:${name}`;
  }
}

// ============================================================================
// Distributed Transpiler
// ============================================================================

/**
 * Distributed transpiler that can delegate work to peer nodes
 */
export class DistributedTranspiler {
  private peerDiscovery: PeerDiscovery;
  private distributedCache: DistributedCache;
  private collaborativeLearning: CollaborativeLearning;
  private peerId: string;
  private capabilities: string[];

  constructor(
    localCache: CacheManager,
    peerDiscovery: PeerDiscovery,
    options: {
      capabilities?: string[];
      shareParsers?: boolean;
      learnFromPeers?: boolean;
      replicationFactor?: number;
    } = {}
  ) {
    this.peerDiscovery = peerDiscovery;
    this.peerId = peerDiscovery['peerId'];
    this.capabilities = options.capabilities || ['javascript', 'typescript', 'python'];
    
    this.distributedCache = new DistributedCache(
      localCache,
      peerDiscovery,
      options.replicationFactor || 2
    );
    
    this.collaborativeLearning = new CollaborativeLearning(peerDiscovery, {
      shareParsers: options.shareParsers,
      learnFromPeers: options.learnFromPeers,
    });
  }

  async transpile(
    source: string,
    options: TranspileOptions,
    localTranspiler: any // Reference to local transpiler
  ): Promise<TranspileResult> {
    const cacheKey = this.generateCacheKey(source, options);
    
    // Try cache first
    const cached = await this.distributedCache.get<TranspileResult>(cacheKey);
    if (cached) {
      return {
        ...cached,
        stats: {
          ...cached.stats,
          cached: true,
          distributed: true,
        },
      };
    }
    
    // Check if we can handle this locally
    if (this.canHandleLocally(options)) {
      const result = await localTranspiler.transpile(source, options);
      
      // Cache the result
      await this.distributedCache.set(cacheKey, result, undefined, {
        sourceHash: this.hashSource(source),
        language: options.sourceType || 'unknown',
        version: '1.0.0',
        peer: this.peerId,
      });
      
      return {
        ...result,
        stats: {
          ...result.stats,
          distributed: false,
          peer: this.peerId,
        },
      };
    }
    
    // Delegate to peer
    const result = await this.delegateToPeer(source, options);
    
    if (result) {
      // Cache the result
      await this.distributedCache.set(cacheKey, result, undefined, {
        sourceHash: this.hashSource(source),
        language: options.sourceType || 'unknown',
        version: '1.0.0',
        peer: result.peer || 'unknown',
      });
      
      return {
        ...result,
        stats: {
          ...result.stats,
          distributed: true,
          peer: result.peer,
        },
      };
    }
    
    // Fallback to local
    return localTranspiler.transpile(source, options);
  }

  private canHandleLocally(options: TranspileOptions): boolean {
    const language = options.sourceType || options.target;
    if (!language) return true;
    
    return this.capabilities.includes(language);
  }

  private async delegateToPeer(
    source: string,
    options: TranspileOptions
  ): Promise<TranspileResult | null> {
    const peers = this.peerDiscovery.getPeers();
    
    // Find peers that can handle this
    const capablePeers = peers.filter(peer => 
      peer.capabilities.includes(options.sourceType || '') ||
      peer.capabilities.includes(options.target || '')
    );
    
    if (capablePeers.length === 0) {
      return null;
    }
    
    // Try peers in order
    for (const peer of capablePeers) {
      try {
        const response = await fetch(`http://${peer.address}:${peer.port}/transpile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Peer-Id': this.peerId,
          },
          body: JSON.stringify({
            source,
            options,
          }),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        });
        
        if (!response.ok) {
          continue;
        }
        
        const result = await response.json();
        return result;
      } catch {
        // Try next peer
        continue;
      }
    }
    
    return null;
  }

  async shareParser(language: string, parser: Parser): Promise<void> {
    await this.collaborativeLearning.learn('parser', language, parser, this.peerId);
  }

  async getSharedParser(language: string): Promise<Parser | null> {
    return this.collaborativeLearning.get('parser', language);
  }

  async shareTransform(name: string, transform: any): Promise<void> {
    await this.collaborativeLearning.learn('transform', name, transform, this.peerId);
  }

  async getSharedTransform(name: string): Promise<any | null> {
    return this.collaborativeLearning.get('transform', name);
  }

  getPeerCount(): number {
    return this.peerDiscovery.getPeers().length;
  }

  getCapabilityCount(): number {
    return this.capabilities.length;
  }

  private generateCacheKey(source: string, options: TranspileOptions): string {
    return `transpile:${this.hashSource(source)}:${options.target}:${options.sourceType || 'auto'}`;
  }

  private hashSource(source: string): string {
    return crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
  }
}

// ============================================================================
// HTTP Server for Network Operations
// ============================================================================

/**
 * HTTP server that exposes network operations
 */
export class NetworkServer {
  private port: number;
  private distributedTranspiler: DistributedTranspiler;
  private localTranspiler: any;
  private peerDiscovery: PeerDiscovery;
  private collaborativeLearning: CollaborativeLearning;
  private server: any = null;

  constructor(
    distributedTranspiler: DistributedTranspiler,
    localTranspiler: any,
    peerDiscovery: PeerDiscovery,
    port: number = DEFAULT_PORT
  ) {
    this.distributedTranspiler = distributedTranspiler;
    this.localTranspiler = localTranspiler;
    this.peerDiscovery = peerDiscovery;
    this.port = port;
    this.collaborativeLearning = distributedTranspiler['collaborativeLearning'];
  }

  async start(): Promise<void> {
    try {
      // express is an optional runtime dependency; only needed for server mode
      const express = require('express');
      const app = express.default();
      
      // Middleware
      app.use(express.json());
      app.use((req: any, res: any, next: any) => {
        const peerId = req.headers['x-peer-id'];
        if (!peerId) {
          res.status(400).json({ error: 'X-Peer-Id header required' });
          return;
        }
        next();
      });
      
      // Transpile endpoint
      app.post('/transpile', async (req: any, res: any) => {
        try {
          const { source, options } = req.body;
          const result = await this.localTranspiler.transpile(source, options);
          res.json(result);
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      });
      
      // Cache endpoints
      app.post('/cache', async (req: any, res: any) => {
        try {
          const request: CacheRequest = req.body;
          
          switch (request.type) {
            case 'get':
              const value = await this.localTranspiler.cache.get(request.key);
              res.json({ success: true, value, ttl: 0, metadata: {} });
              break;
            case 'set':
              await this.localTranspiler.cache.set(request.key, request.value, request.ttl, request.metadata);
              res.json({ success: true });
              break;
            case 'delete':
              await this.localTranspiler.cache.delete(request.key);
              res.json({ success: true });
              break;
            case 'list':
              const entries = await this.localTranspiler.cache.list(request.key);
              res.json({ success: true, entries });
              break;
            default:
              res.status(400).json({ success: false, error: 'Invalid cache operation' });
          }
        } catch (error: any) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      // Learn endpoints
      app.post('/learn', async (req: any, res: any) => {
        try {
          const request: LearnRequest = req.body;
          const id = await this.collaborativeLearning.learn(
            request.type,
            request.name,
            request.data,
            req.headers['x-peer-id']
          );
          res.json({ success: true, id });
        } catch (error: any) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      app.post('/learn/get', async (req: any, res: any) => {
        try {
          const { type, name } = req.body;
          const data = await this.collaborativeLearning.get(type, name);
          if (data) {
            res.json({ success: true, data });
          } else {
            res.status(404).json({ success: false, error: 'Not found' });
          }
        } catch (error: any) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      app.post('/learn/sync', async (_req: any, res: any) => {
        try {
          const items = await this.collaborativeLearning.list();
          res.json(items);
        } catch (error: any) {
          res.status(500).json({ success: false, error: error.message });
        }
      });
      
      // Info endpoint
      app.get('/info', (_req: any, res: any) => {
        res.json({
          id: this.peerDiscovery['peerId'],
          address: this.peerDiscovery['address'],
          port: this.port,
          capabilities: this.distributedTranspiler.getCapabilityCount(),
          peers: this.peerDiscovery.getPeers().length,
        });
      });
      
      // Start server
      this.server = app.listen(this.port, () => {
        console.log(`Network server started on port ${this.port}`);
      });
    } catch (error) {
      console.error('Failed to start network server:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('Network server stopped');
    }
  }
}

// ============================================================================
// Network Manager
// ============================================================================

/**
 * Main network manager that coordinates all network operations
 */
export class NetworkManager {
  private peerDiscovery: PeerDiscovery;
  private distributedTranspiler: DistributedTranspiler;
  private networkServer: NetworkServer;
  /** Local cache manager coordinated over the network. */
  localCache: CacheManager;
  private localTranspiler: any;
  private running = false;

  constructor(
    localTranspiler: any,
    localCache: CacheManager,
    config: NetworkConfig = {}
  ) {
    this.localTranspiler = localTranspiler;
    this.localCache = localCache;
    
    this.peerDiscovery = new PeerDiscovery(config);
    this.distributedTranspiler = new DistributedTranspiler(
      localCache,
      this.peerDiscovery,
      {
        capabilities: config.capabilities,
        shareParsers: config.shareParsers !== false,
        learnFromPeers: config.learnFromPeers !== false,
        replicationFactor: config.cacheReplication || 2,
      }
    );
    
    this.networkServer = new NetworkServer(
      this.distributedTranspiler,
      localTranspiler,
      this.peerDiscovery,
      config.port || DEFAULT_PORT
    );
  }

  async start(): Promise<void> {
    if (this.running) return;
    
    this.running = true;
    
    // Start peer discovery
    await this.peerDiscovery.start();
    
    // Start network server
    await this.networkServer.start();
    
    console.log('Network manager started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    
    this.running = false;
    
    // Stop network server
    await this.networkServer.stop();
    
    // Stop peer discovery
    await this.peerDiscovery.stop();
    
    console.log('Network manager stopped');
  }

  async transpile(source: string, options: TranspileOptions): Promise<TranspileResult> {
    return this.distributedTranspiler.transpile(source, options, this.localTranspiler);
  }

  getPeers(): PeerInfo[] {
    return this.peerDiscovery.getPeers();
  }

  getPeerCount(): number {
    return this.distributedTranspiler.getPeerCount();
  }

  async shareParser(language: string, parser: Parser): Promise<void> {
    await this.distributedTranspiler.shareParser(language, parser);
  }

  async getSharedParser(language: string): Promise<Parser | null> {
    return this.distributedTranspiler.getSharedParser(language);
  }

  async shareTransform(name: string, transform: any): Promise<void> {
    await this.distributedTranspiler.shareTransform(name, transform);
  }

  async getSharedTransform(name: string): Promise<any | null> {
    return this.distributedTranspiler.getSharedTransform(name);
  }

  getDistributedCache(): DistributedCache {
    return this.distributedTranspiler['distributedCache'];
  }

  getCollaborativeLearning(): CollaborativeLearning {
    return this.distributedTranspiler['collaborativeLearning'];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a network manager with sensible defaults
 */
export function createNetworkManager(
  localTranspiler: any,
  localCache: CacheManager,
  config?: NetworkConfig
): NetworkManager {
  return new NetworkManager(localTranspiler, localCache, config);
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_PORT,
  DEFAULT_BROADCAST_PORT,
  DEFAULT_TIMEOUT,
  MESSAGE_TTL,
  PING_INTERVAL,
  PEER_TIMEOUT,
};

export default NetworkManager;
