import { EventEmitter } from 'node:events';
import type { Client, IntentsBitField, Message, PermissionsBitField } from 'discord.js';
import type { BotOptions, CommandMeta, Middleware } from './api-types.js';
import type { Context } from './context.js';
import type { CommandNode, EntryPointDefinition } from './define.js';
import type { Store } from './store.js';

export type CommandDefinition =
  | Readonly<CommandMeta & CommandNode<any>>
  | Readonly<EntryPointDefinition>
  | Readonly<{ name: string; type: 'user' | 'message'; run: (ctx: Context, target: any) => unknown }>;

export type Registration = { name: string; type: number; [key: string]: unknown };
export type CommandSummary = { name: string; type: number };
export type SyncResult = { scope: string; count: number; changed: boolean };
export type SyncPlan = {
  scope: string;
  create: CommandSummary[];
  upsert: CommandSummary[];
  delete: CommandSummary[];
  keep: CommandSummary[];
};
export type PermissionTarget =
  ({ guildId: string; channelId?: never; implicit?: never } | { channelId: string; guildId?: never; implicit?: boolean }) &
  ({ userId: string; roleId?: never } | { roleId: string; userId?: never });
export type ManifestRoute = { id: string } | { pattern: string; flags: string };
export type Manifest = {
  intents: ReturnType<IntentsBitField['toArray']>;
  scopes: { scope: string; commands: Registration[] }[];
  prefixes: string[];
  components: ManifestRoute[];
  modals: ManifestRoute[];
  events: string[];
  tasks: string[];
  plugins: string[];
};

type Logger = NonNullable<BotOptions['logger']>;
type ResolvedOptions = BotOptions & Required<Pick<BotOptions,
  'sync' | 'validate' | 'mentionPrefix' | 'ownersBypassCooldown' | 'defaultLocale' | 'allowedMentions' | 'messages'
>>;

export function createLogger(level?: BotOptions['logLevel']): Logger;
export function loadDefinitions(dir: string, bust?: string): Promise<{
  definitions: object[];
  errors: { file: string; error: Error }[];
}>;
export function createBot(options?: BotOptions): Bot;

export class Bot extends EventEmitter {
  constructor(options?: BotOptions);
  commands: Map<string, CommandDefinition>;
  owners: Set<string>;
  middleware: Middleware[];
  options: ResolvedOptions;
  log: Logger;
  store: Store;
  client: Client;
  get plugins(): string[];
  get summary(): { commands: number; components: number; modals: number; events: number; tasks: number };
  get intents(): IntentsBitField;
  message(key: string, ...args: unknown[]): string | null | undefined;
  t(locale: string, key: string, vars?: Record<string, unknown>): string;
  use(...middleware: (Middleware | Middleware[])[]): this;
  add(...definitions: (object | object[])[]): this;
  getCommand(name: string, type?: 'slash' | 'user' | 'message' | 'entryPoint'): CommandDefinition | undefined;
  load(dir?: string | string[], bust?: string): Promise<this>;
  loadLocales(dir?: string): Promise<void>;
  commandData(): Map<string, Registration[]>;
  manifest(): Manifest;
  sync(options?: { force?: boolean; prune?: boolean; token?: string }): Promise<SyncResult[]>;
  planSync(options?: { prune?: boolean; token?: string }): Promise<SyncPlan[]>;
  fetchPermissions(target: PermissionTarget): Promise<Readonly<PermissionsBitField>>;
  start(token?: string): Promise<this>;
  prepareREST(token?: string): Promise<this>;
  stop(): Promise<void>;
  invoke(ctx: Context, definition: object, options?: { path?: string[] }): Promise<void>;
  handleMessage(message: Message): Promise<Context | undefined>;
  #private;
}
