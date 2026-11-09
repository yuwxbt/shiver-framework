import type { Attachment, PermissionResolvable } from 'discord.js';
import type { BotOptions, Component, FieldValue, Modal } from './api-types.js';
import type { Bot, CommandDefinition } from './bot.js';
import type { Context } from './context.js';
import type { HandlerDefinition } from './define.js';

export type TestClick = string | { id: string; values?: string[]; user?: object };
export type SimulationOptions = {
  user?: object;
  member?: object;
  guild?: object;
  guildId?: string | null;
  channel?: object;
  permissions?: PermissionResolvable;
  botPermissions?: PermissionResolvable;
  bot?: Bot;
  locale?: string;
  entitlements?: object[];
  clicks?: TestClick[];
  submit?: Record<string, FieldValue>;
};

export type RecordedReply = {
  method: string;
  content?: string | null;
  components?: Component[];
  embeds?: object[];
  flags?: number;
  modal?: Modal;
  ephemeral: boolean;
  text: string;
  [key: string]: unknown;
};

export type TestResult<C extends Context | null = Context> = {
  ctx: C;
  replies: RecordedReply[];
  last: RecordedReply | null;
  text: string;
  modal: Modal | null;
  error: Error | null;
};

export function createTestBot(options?: BotOptions): Bot;
export function runCommand(definition: CommandDefinition, options?: SimulationOptions & {
  options?: Record<string, unknown>;
  sub?: string | string[];
  target?: unknown;
}): Promise<TestResult>;
export function runPrefix(definition: CommandDefinition, options?: SimulationOptions & {
  content?: string;
  prefix?: string;
  attachments?: (Pick<Attachment, 'id' | 'name'> & Partial<Attachment>)[];
}): Promise<TestResult<Context | null>>;
export function runComponent(definition: HandlerDefinition, options?: SimulationOptions & {
  id?: string;
  values?: string[];
}): Promise<TestResult>;
export function runModal(definition: HandlerDefinition, options?: SimulationOptions & {
  id?: string;
  fields?: Record<string, FieldValue>;
}): Promise<TestResult>;
